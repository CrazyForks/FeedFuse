// 订阅源业务工具统一出口，避免 utils 文件散落。
export {
  buildAiDigestSourceTreeData,
  computeVisibleTagCount,
  filterAiDigestSourceTreeData,
  getCategorySelectionState,
  sanitizeSelectedFeedIds,
  toggleCategorySelection,
  toggleFeedSelection,
} from './aiDigestSourceTree.utils';
export type { CategorySelectionState, SourceTreeCategoryNode, SourceTreeFeedNode } from './aiDigestSourceTree.utils';
