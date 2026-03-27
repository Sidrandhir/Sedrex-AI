/**
 * SEDREX — Message Rendering Optimization Utilities v1.0
 * Memoized components and utilities for smooth chat rendering
 * Prevents unnecessary re-renders and improves scrolling performance
 */

import React, { memo } from 'react';
import { Message } from '../types';

/**
 * Optimized Message Renderer
 * Memoized to prevent re-renders when parent updates but message hasn't changed
 */
export const OptimizedMessageRow = memo(
  ({ message, isLoading }: { message: Message; isLoading?: boolean }) => {
    return (
      <div
        key={message.id}
        data-message-id={message.id}
        style={{
          opacity: isLoading ? 0.7 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        {/* Message content rendered by parent */}
      </div>
    );
  },
  (prev, next) => {
    // Custom comparison to prevent re-renders
    return (
      prev.message.id === next.message.id &&
      prev.message.content === next.message.content &&
      prev.isLoading === next.isLoading
    );
  }
);

OptimizedMessageRow.displayName = 'OptimizedMessageRow';

/**
 * Debounced markdown preprocessing
 * Caches result for identical input
 */
const markdownCache = new Map<string, string>();

export function preprocessMarkdownOptimized(raw: string): string {
  if (!raw) return '';

  // Check cache first
  if (markdownCache.has(raw)) {
    return markdownCache.get(raw)!;
  }

  let result = raw;

  // FIX 1a: Strip HTML <br> tags — replace with newline
  result = result.replace(/<br\s*\/?>/gi, '\n');

  // FIX 1b: Remove stray HTML tags from LLM output
  result = result.replace(/<(?!\/?(strong|em|code|s)\b)[^>]+>/gi, '');

  // FIX 1c: Strict separator-only regex
  result = result.replace(
    /^\|(\s*:?-+:?\s*\|)+\s*$/gm,
    (row) => row.replace(/:{2,}/g, ':')
  );

  // FIX 1d: Blank line BEFORE table block
  result = result.replace(
    /([^\n])\n(\|[^\n]+\|\n\|[-:\s|]+\|)/g,
    '$1\n\n$2'
  );

  // FIX 1e: Blank line AFTER table block
  result = result.replace(
    /(\|[^\n]+\|\n)(?!\|)/g,
    '$1\n'
  );

  // FIX 1f: Auto-wrap bare mermaid/graph blocks
  result = result.replace(
    /^(graph\s+(?:TD|LR|RL|BT|TB)[\s\S]*?)(?=\n{2,}|$)/gm,
    (match) => {
      if (match.trim().startsWith('```')) return match;
      if (!match.includes('-->') && !match.includes('->')) return match;
      return '```mermaid\n' + match.trim() + '\n```';
    }
  );

  result = result.replace(
    /^((?:flowchart\s+(?:TD|LR|RL|BT|TB)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie)[\s\S]*?)(?=\n{2,}|$)/gm,
    (match) => {
      if (match.trim().startsWith('```')) return match;
      if (!match.includes('-->') && !match.includes('->') && !match.includes(':'))
        return match;
      return '```mermaid\n' + match.trim() + '\n```';
    }
  );

  // Limit cache size to 100 entries
  if (markdownCache.size > 100) {
    const firstKey = markdownCache.keys().next().value as string | undefined;
    if (firstKey !== undefined) markdownCache.delete(firstKey);
  }

  markdownCache.set(raw, result);
  return result;
}

/**
 * Virtual scrolling optimizer for large chat histories
 * Only renders visible messages
 */
export class VirtualScrollHelper {
  private itemHeight = 80; // Average message height
  private containerHeight = 0;
  private scrollTop = 0;

  setDimensions(containerHeight: number, itemHeight = 80): void {
    this.containerHeight = containerHeight;
    this.itemHeight = itemHeight;
  }

  setScrollTop(scrollTop: number): void {
    this.scrollTop = scrollTop;
  }

  getVisibleRange(totalItems: number): [start: number, end: number] {
    const start = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - 5);
    const end = Math.min(
      totalItems,
      Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight) + 5
    );
    return [start, end];
  }
}

/**
 * Optimized string truncation for previews
 */
export function truncateString(
  str: string,
  maxLen = 200,
  ellipsis = '...'
): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - ellipsis.length) + ellipsis;
}

/**
 * Debounce render updates
 */
export function createDebouncedUpdater<T>(
  setter: (value: T) => void,
  delay = 100
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;

  return (value: T) => {
    pending = value;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      setter(pending!);
      timeout = null;
    }, delay);
  };
}

console.log('[OPTIMIZE] Message rendering utilities loaded');
