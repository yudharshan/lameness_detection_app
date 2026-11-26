import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CircleCheck,
  Images,
  Info,
  Loader,
} from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LiveDot } from '@/components/ui/live-dot';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { VelocityFilterCard } from '@/components/velocity-filter-card';
import { VirtualTriggerOverlay } from '@/components/virtual-trigger-overlay';
import { COLORS } from '@/constants/theme';
import { API_BASE_URL, uploadVideoForAnalysis } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/herd';
import { useHerdStore } from '@/store/herdStore';

type PipelineStatus = 'idle' | 'running' | 'complete' | 'error';
type LogTone = 'info' | 'success' | 'warn';

interface PipelineLog {
  id: number;
  text: string;
  tone: LogTone;
}

interface Telemetry {
  velocity: number;
  variance: number;
  retained: number;
  purged: number;
}

const PIPELINE_STEPS = [
  {
    title: 'Ingest continuous footage',
    detail: '640 × 640 · 30 FPS · monocular RGB',
  },
  {
    title: 'Assign persistent IDs',
    detail: 'ByteTrack locks the next C-number',
  },
  {
    title: 'Isolate temporal buffer',
    detail: 'S_k = {(x_i, y_i, t)}',
  },
  {
    title: 'Purge velocity noise',
    detail: 'Static pauses + turning frames',
  },
  {
    title: 'Compute & append passage',
    detail: 'Biomechanical engine → herd record',
  },
];

/** Detection-box position per pipeline stage, 0 = entry, 1 = passage. */
const CROSSING_BY_STEP = [0.12, 0.3, 0.44, 0.52, 0.64];

const LOG_TONE: Record<LogTone, string> = {
  info: '#D7EDE0',
  success: '#FCD34D',
  warn: '#FCA5A5',
};

function tapFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function successFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}

function formatBackendError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'Analysis timed out after 60 seconds. Try a shorter clip or verify the backend is responsive.';
    }
    if (/failed to fetch|network request failed|networkerror/i.test(error.message)) {
      return `Could not reach the HerdSight backend at ${API_BASE_URL}. Ensure the Python server is running.`;
    }
    return error.message;
  }
  return `Unable to analyze video. Check that the backend at ${API_BASE_URL} is running.`;
}

export default function UploadScreen() {
  const router = useRouter();
  const passages = useHerdStore((state) => state.passages);
  const selectPassage = useHerdStore((state) => state.selectPassage);

  const [busy, setBusy] = useState(false);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pipeline, setPipeline] = useState<PipelineStatus>('idle');
  const [stepIndex, setStepIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [pipelineTag, setPipelineTag] = useState('');
  const [crossing, setCrossing] = useState(0.1);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    velocity: 0,
    variance: 0,
    retained: 0,
    purged: 0,
  });
  const [history, setHistory] = useState<number[]>([]);

  const logSeq = useRef(0);

  const pushLog = (text: string, tone: LogTone = 'info') => {
    const id = logSeq.current + 1;
    logSeq.current = id;
    setLogs((prev) => [...prev, { id, text, tone }].slice(-6));
  };

  const processing = useMemo(
    () =>
      passages
        .filter((passage) => passage.status === 'Processing')
        .sort((a, b) => b.entryOrder - a.entryOrder),
    [passages],
  );

  const lastAdded =
    passages.find((passage) => passage.id === lastAddedId) ?? null;

  const nextOrder =
    passages.reduce((max, passage) => Math.max(max, passage.entryOrder), 0) + 1;

  const upcomingTag = pipelineTag || `C${nextOrder}`;
  const pipelineRunning = pipeline === 'running';
  const controlsDisabled = busy || pipelineRunning;

  const analyzeCapture = async (videoUri: string) => {
    const state = useHerdStore.getState();
    const order =
      state.passages.reduce(
        (max, passage) => Math.max(max, passage.entryOrder),
        0,
      ) + 1;

    setErrorMessage(null);
    setPipeline('running');
    setPipelineTag(`C${order}`);
    setStepIndex(1);
    setProgress(35);
    setCrossing(CROSSING_BY_STEP[1]);
    setLogs([]);
    pushLog(`Uploading clip for C${order}…`);
    pushLog('Running YOLOv8-Pose + ByteTrack on backend…');

    try {
      const analyzed = await uploadVideoForAnalysis(videoUri, order);
      if (analyzed.length === 0) {
        throw new Error('No cattle detected walking through the corridor ROI.');
      }

      analyzed.forEach((passage) => {
        useHerdStore.getState().addPassage(passage);
      });

      const latest = analyzed[analyzed.length - 1];
      const vLog = latest.metrics.velocityLog;
      const retainedSamples = vLog.filter((sample) => !sample.purged);
      const purgedCount = vLog.length - retainedSamples.length;
      const meanVelocity =
        retainedSamples.length > 0
          ? retainedSamples.reduce((sum, s) => sum + s.v, 0) /
            retainedSamples.length
          : 0;
      const variance =
        retainedSamples.length > 1
          ? Math.sqrt(
              retainedSamples.reduce(
                (sum, s) => sum + (s.v - meanVelocity) ** 2,
                0,
              ) / retainedSamples.length,
            )
          : 0;

      setTelemetry({
        velocity: Number(meanVelocity.toFixed(2)),
        variance: Number(variance.toFixed(2)),
        retained: retainedSamples.length,
        purged: purgedCount,
      });
      setHistory(retainedSamples.map((sample) => sample.v).slice(-26));
      setPipelineTag(latest.tagId);
      setStepIndex(PIPELINE_STEPS.length);
      setProgress(100);
      setCrossing(0.7);
      setPipeline('complete');
      setLastAddedId(latest.id);
      pushLog(
        `Scored ${analyzed.map((p) => p.tagId).join(', ')} (${analyzed.length} passage${analyzed.length === 1 ? '' : 's'})`,
        'success',
      );
      successFeedback();
    } catch (error) {
      const message = formatBackendError(error);
      setPipeline('error');
      setProgress(0);
      setStepIndex(-1);
      setErrorMessage(message);
      pushLog(message, 'warn');
      Alert.alert('Analysis failed', message);
    }
  };

  const recordWalkThrough = async () => {
    if (controlsDisabled) return;
    tapFeedback();

    if (Platform.OS === 'web') {
      const message =
        'Camera recording is unavailable in the web preview. Use the Library button to upload a video clip.';
      setErrorMessage(message);
      Alert.alert('Camera unavailable on web', message);
      return;
    }

    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera access needed',
          'Enable camera access to record a walk-through, or import an existing clip.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 45,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        quality: 0.8,
      });

      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        await analyzeCapture(asset.uri);
      }
    } catch {
      Alert.alert(
        'Recording failed',
        'The camera could not be opened. You can import an existing clip instead.',
      );
    } finally {
      setBusy(false);
    }
  };

  const importClip = async () => {
    if (controlsDisabled) return;
    setBusy(true);
    tapFeedback();

    try {
      if (Platform.OS !== 'web') {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Library access needed',
            'Allow photo library access to attach a walk-through clip.',
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
      });

      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        await analyzeCapture(asset.uri);
      }
    } catch {
      Alert.alert(
        'Import failed',
        'The video could not be opened. Try a different clip.',
      );
    } finally {
      setBusy(false);
    }
  };

  const stepState = (index: number): 'done' | 'active' | 'pending' => {
    if (pipeline === 'complete') return 'done';
    if (pipeline === 'running') {
      if (index < stepIndex) return 'done';
      if (index === stepIndex) return 'active';
    }
    return 'pending';
  };

  const pipelineMeta =
    pipeline === 'running'
      ? {
          label: 'Running',
          badge: 'bg-amber-50 border-amber-200',
          text: 'text-amber-700',
          dot: 'bg-amber-400',
        }
      : pipeline === 'complete'
        ? {
            label: 'Complete',
            badge: 'bg-forest-50 border-forest-200',
            text: 'text-forest-700',
            dot: 'bg-forest-600',
          }
        : pipeline === 'error'
          ? {
              label: 'Error',
              badge: 'bg-crimson-50 border-crimson-200',
              text: 'text-crimson-700',
              dot: 'bg-crimson-500',
            }
          : {
              label: 'Ready',
              badge: 'bg-canvas border-line',
              text: 'text-ink-muted',
              dot: 'bg-ink-faint',
            };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        eyebrow="Capture protocol"
        title="Record Walk-Through"
        right={
          <View className="mt-0.5 items-center rounded-2xl border border-line bg-surface px-3 py-2">
            <Text className="text-[8px] font-bold tracking-[1.1px] text-ink-faint">
              NEXT
            </Text>
            <Text className="text-[13px] font-bold leading-5 text-ink">
              C{nextOrder}
            </Text>
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 44 }}
      >
        <View className="overflow-hidden rounded-3xl bg-forest-950 p-4">
          <View className="flex-row items-center justify-between">
            <View
              className="flex-row items-center gap-1.5 rounded-full border px-2 py-1"
              style={{
                borderColor: 'rgba(248, 113, 113, 0.35)',
                backgroundColor: 'rgba(220, 38, 38, 0.12)',
              }}
            >
              <LiveDot size={3.5} color="#F87171" />
              <Text className="text-[7.5px] font-bold tracking-[1.1px] text-crimson-200">
                LIVE INGEST
              </Text>
            </View>
            <Text className="text-[9px] font-medium text-forest-300">
              CHUTE A · 4.2 m line
            </Text>
          </View>

          <View className="mt-3 flex-row">
            <View className="flex-1">
              <Text className="text-[7.5px] font-bold uppercase tracking-[1.1px] text-forest-400">
                Resolution
              </Text>
              <Text className="mt-0.5 text-[10px] font-semibold text-white">
                640 × 640 @ 30 FPS
              </Text>
            </View>
            <View
              className="w-px"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.12)' }}
            />
            <View className="flex-1 pl-3">
              <Text className="text-[7.5px] font-bold uppercase tracking-[1.1px] text-forest-400">
                Tracker
              </Text>
              <Text className="mt-0.5 text-[10px] font-semibold text-white">
                YOLOv8 Pose + ByteTrack
              </Text>
            </View>
          </View>

          <View
            className="mt-2.5 flex-row items-center gap-1.5 border-t pt-2.5"
            style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <LiveDot size={3} color={COLORS.amber[400]} />
            <Text className="text-[7.5px] font-bold uppercase tracking-[1.1px] text-forest-400">
              Ingestion
            </Text>
            <Text className="text-[10px] font-semibold text-white">
              Monocular RGB Stream Active
            </Text>
          </View>

          <View
            className="mt-3 overflow-hidden rounded-2xl"
            style={{ height: 236 }}
          >
            <LinearGradient
              colors={['#0B2C1F', '#05160F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 70,
                backgroundColor: 'rgba(36, 135, 90, 0.1)',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 70,
                height: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.07)',
              }}
            />

            <VirtualTriggerOverlay
              tagId={upcomingTag}
              crossing={crossing}
              confidence={0.96}
            />

            <View className="absolute bottom-1.5 left-3 right-3 flex-row items-center justify-between">
              <Text className="text-[7.5px] font-semibold tracking-[1px] text-forest-300">
                CAM 01 · SIDE VIEW
              </Text>
              <Text className="text-[7.5px] font-semibold tracking-[1px] text-forest-300">
                33 MS / FRAME
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row gap-2">
            <Button
              label={busy ? 'Opening…' : 'Record'}
              icon={Camera}
              variant="amber"
              className="flex-1"
              disabled={controlsDisabled}
              onPress={recordWalkThrough}
            />
            <Button
              label="Library"
              icon={Images}
              variant="secondary"
              className="flex-1"
              disabled={controlsDisabled}
              onPress={importClip}
            />
          </View>

          <View className="mt-2 flex-row items-center justify-center gap-1.5">
            <Info size={10} color={COLORS.forest[300]} strokeWidth={2} />
            <Text className="text-[8.5px] text-forest-300">
              Up to 45 s per clip · processed on-device
            </Text>
          </View>
        </View>

        <VelocityFilterCard
          velocity={telemetry.velocity}
          lateralVariance={telemetry.variance}
          history={history}
          retained={telemetry.retained}
          purged={telemetry.purged}
          busy={pipelineRunning}
        />

        <Card className="mt-3 p-4">
          <SectionHeading
            title="Continuous processing"
            meta="Virtual trigger · 5-stage pipeline"
            right={
              <View
                className={cn(
                  'flex-row items-center gap-1.5 rounded-full border px-2 py-1',
                  pipelineMeta.badge,
                )}
              >
                <View
                  className={cn('h-1.5 w-1.5 rounded-full', pipelineMeta.dot)}
                />
                <Text
                  className={cn(
                    'text-[8px] font-bold uppercase tracking-[0.7px]',
                    pipelineMeta.text,
                  )}
                >
                  {pipelineMeta.label}
                </Text>
              </View>
            }
          />

          <View className="flex-row items-center justify-between">
            <Text className="text-[8.5px] font-bold uppercase tracking-[1.1px] text-ink-faint">
              Stream progress
            </Text>
            <Text
              className="text-[10px] font-bold text-forest-700"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {progress}%
            </Text>
          </View>
          <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
            <View
              className="h-full rounded-full bg-forest-600"
              style={{ width: `${progress}%` }}
            />
          </View>

          <View className="mt-3.5 gap-2.5">
            {PIPELINE_STEPS.map((step, index) => {
              const state = stepState(index);
              return (
                <View key={step.title} className="flex-row items-start gap-2.5">
                  <View
                    className={cn(
                      'mt-0.5 h-5 w-5 items-center justify-center rounded-full border',
                      state === 'done'
                        ? 'border-forest-600 bg-forest-600'
                        : state === 'active'
                          ? 'border-amber-400 bg-amber-400'
                          : 'border-line bg-canvas',
                    )}
                  >
                    {state === 'done' ? (
                      <Check size={11} color="#FFFFFF" strokeWidth={3} />
                    ) : (
                      <Text
                        className={cn(
                          'text-[9px] font-bold',
                          state === 'active'
                            ? 'text-forest-950'
                            : 'text-ink-faint',
                        )}
                      >
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text
                        className={cn(
                          'flex-1 text-[11px] font-semibold',
                          state === 'pending' ? 'text-ink-faint' : 'text-ink',
                        )}
                      >
                        {step.title}
                      </Text>
                      {state === 'active' ? (
                        <Text className="text-[8px] font-bold uppercase tracking-[0.7px] text-amber-700">
                          Running
                        </Text>
                      ) : state === 'done' ? (
                        <Text className="text-[8px] font-bold uppercase tracking-[0.7px] text-forest-600">
                          Done
                        </Text>
                      ) : null}
                    </View>
                    <Text className="mt-0.5 text-[9px] text-ink-faint">
                      {step.detail}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {logs.length > 0 ? (
            <View className="mt-3 overflow-hidden rounded-2xl bg-forest-950 p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-[8px] font-bold uppercase tracking-[1.2px] text-forest-300">
                  Pipeline log
                </Text>
                <Text className="text-[8px] font-semibold text-forest-400">
                  {logs.length} events
                </Text>
              </View>
              <View className="mt-1.5 gap-0.5">
                {logs.map((entry) => (
                  <Text
                    key={entry.id}
                    className="text-[9.5px] leading-[14px]"
                    style={{ color: LOG_TONE[entry.tone] }}
                    numberOfLines={2}
                  >
                    <Text style={{ color: COLORS.forest[400] }}>›</Text>{' '}
                    {entry.text}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {errorMessage ? (
          <View className="mt-3 flex-row items-start gap-2.5 rounded-2xl border border-crimson-200 bg-crimson-50 px-3.5 py-3">
            <AlertTriangle
              size={16}
              color={COLORS.crimson[600]}
              strokeWidth={2.3}
              style={{ marginTop: 1 }}
            />
            <View className="flex-1">
              <Text className="text-[11px] font-bold text-crimson-700">
                Analysis failed
              </Text>
              <Text className="mt-0.5 text-[10.5px] leading-4 text-crimson-700">
                {errorMessage}
              </Text>
            </View>
          </View>
        ) : null}

        {lastAdded ? (
          <Pressable
            onPress={() => {
              selectPassage(lastAdded.id);
              router.push('/analytics');
            }}
            accessibilityRole="button"
            accessibilityLabel={`View evidence for ${lastAdded.tagId}`}
            className="mt-3 flex-row items-center gap-2.5 rounded-2xl border border-forest-200 bg-forest-50 px-3.5 py-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <CircleCheck
              size={16}
              color={COLORS.forest[600]}
              strokeWidth={2.3}
            />
            <Text className="flex-1 text-[10.5px] leading-4 text-forest-800">
              {lastAdded.tagId}{' '}
              {lastAdded.status === 'Processing'
                ? `queued as passage #${lastAdded.entryOrder}. Analysis usually finishes in a few seconds.`
                : `added as passage #${lastAdded.entryOrder}. Evidence report is ready.`}
            </Text>
            <ArrowRight
              size={14}
              color={COLORS.forest[700]}
              strokeWidth={2.4}
            />
          </Pressable>
        ) : null}

        <View className="mt-6">
          <SectionHeading
            title="Processing queue"
            meta={`${processing.length} clip${processing.length === 1 ? '' : 's'} in flight`}
            right={<Loader size={13} color={COLORS.inkFaint} strokeWidth={2} />}
          />

          {processing.length === 0 ? (
            <View className="items-center rounded-2xl border border-dashed border-line px-4 py-6">
              <Text className="text-[11px] text-ink-muted">
                Queue empty — every captured passage has been scored.
              </Text>
            </View>
          ) : (
            <Card padded={false} className="overflow-hidden">
              {processing.map((passage, index) => (
                <View
                  key={passage.id}
                  className={cn('p-4', index > 0 && 'border-t border-line')}
                >
                  <View className="flex-row items-center gap-2.5">
                    <View className="h-8 w-8 items-center justify-center rounded-xl border border-line bg-canvas">
                      <Text className="text-[10px] font-bold text-ink">
                        {passage.tagId}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[12px] font-semibold text-ink">
                        Passage #{passage.entryOrder} ·{' '}
                        {formatClock(passage.passageTime)}
                      </Text>
                      <Text
                        className="mt-0.5 text-[9.5px] text-ink-faint"
                        numberOfLines={1}
                      >
                        {passage.analysisNote}
                      </Text>
                    </View>
                    <Loader
                      size={14}
                      color={COLORS.forest[600]}
                      strokeWidth={2.2}
                    />
                  </View>

                  <View className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line">
                    <View className="h-full w-2/3 rounded-full bg-forest-600" />
                  </View>
                  <View className="mt-1.5 flex-row items-center justify-between">
                    <Text className="text-[9px] text-ink-faint">
                      Pose estimation
                    </Text>
                    <Text className="text-[9px] font-semibold text-forest-700">
                      Stage 3 of 4
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        <View className="mt-4 flex-row gap-2 rounded-2xl border border-line bg-white/60 p-3.5">
          <Info
            size={13}
            color={COLORS.inkFaint}
            strokeWidth={2}
            style={{ marginTop: 1 }}
          />
          <Text className="flex-1 text-[9.5px] leading-[15px] text-ink-faint">
            Clips stay on-device; only pose keypoints and derived gait metrics
            enter the herd record. A capture can be re-scored at any time from
            the passage stream.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
