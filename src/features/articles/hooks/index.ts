// 文章阅读域 hooks 统一从这里导出，便于按业务域维护。
export { useAnimatedAiSummaryText } from './useAnimatedAiSummaryText';
export { useImmersiveTranslation } from './useImmersiveTranslation';
export { useStreamingAiSummary } from './useStreamingAiSummary';
export type {
  ImmersiveTranslationApi,
  UseImmersiveTranslationResult,
} from './useImmersiveTranslation';
export type { StreamingAiSummaryApi } from './useStreamingAiSummary';
