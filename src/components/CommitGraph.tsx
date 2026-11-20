/**
 * CommitGraph.tsx
 *
 * Interactive SVG/Canvas Directed Acyclic Graph (DAG) visualizer for Jujutsu.
 * Computes columnar branch layouts, draws topological connector paths,
 * highlights the working copy (@) with an animated glow, and renders bookmarks/tags.
 */

import React, { useMemo, useState } from 'react';
import {
  GitCommit,
  Sparkles,
  Bookmark,
  GitBranch,
  Shield,
  AlertTriangle,
  User,
  Clock,
  Layers,
} from 'lucide-react';
import type { JJCommit } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

interface CommitGraphProps {
  commits: JJCommit[];
  selectedCommit: JJCommit | null;
  onSelectCommit: (commit: JJCommit) => void;
  loading?: boolean;
}

interface LayoutNode {
  commit: JJCommit;
  x: number;
  y: number;
  col: number;
  row: number;
  color: string;
}

const PALETTE = [
  '#89b4fa', // Blue (active / working copy)
  '#a6e3a1', // Green (feature)
  '#f9e2af', // Yellow (review / head)
  '#cba6f7', // Mauve / Purple
  '#f38ba8', // Red / conflict
  '#fab387', // Peach
  '#94e2d5', // Teal
];

export function CommitGraph({
  commits,
  selectedCommit,
  onSelectCommit,
  loading = false,
}: CommitGraphProps) {
  const { t } = useLanguage();
  const [filterQuery, setFilterQuery] = useState('');
  const [showOnlyBookmarks, setShowOnlyBookmarks] = useState(false);

  // Compute 2D node coordinates and edge routes
  const { nodes, edges, maxCol, totalHeight } = useMemo(() => {
    if (!commits || commits.length === 0) {
      return { nodes: [], edges: [], maxCol: 0, totalHeight: 300 };
    }

    const rowHeight = 72;
    const colWidth = 28;
    const leftMargin = 38;
    const topMargin = 32;

    const idToNodeMap = new Map<string, LayoutNode>();
    const computedNodes: LayoutNode[] = [];
    const activeLanes: (string | null)[] = [];

    // Filter commits based on search query. A commit that is the parent of
    // a visible commit is never filtered out: hiding it would cut the edge
    // with no indication and leave its lane occupied forever.
    const visibleIds = new Set<string>();
    const matchesFilter = (c: JJCommit) => {
      if (showOnlyBookmarks && (!c.bookmarks || c.bookmarks.length === 0) && !c.is_working_copy) {
        return false;
      }
      if (!filterQuery) return true;
      const q = filterQuery.toLowerCase();
      return (
        c.description.toLowerCase().includes(q) ||
        c.short_change_id.toLowerCase().includes(q) ||
        c.change_id.toLowerCase().includes(q) ||
        c.author.name.toLowerCase().includes(q) ||
        c.bookmarks.some(b => b.toLowerCase().includes(q))
      );
    };
    const filteredCommits = commits.filter(c => {
      if (matchesFilter(c)) {
        visibleIds.add(c.change_id);
        visibleIds.add(c.id);
        return true;
      }
      return false;
    });
    // Add back parents of visible commits (one pass is enough for the edge
    // to render; grandparents stay hidden only when their child is hidden).
    for (const c of commits) {
      if (!visibleIds.has(c.change_id)) continue;
      for (const p of c.parents || []) {
        if (!visibleIds.has(p)) {
          const parent = commits.find(x => x.change_id === p || x.id === p);
          if (parent) {
            filteredCommits.push(parent);
            visibleIds.add(parent.change_id);
            visibleIds.add(parent.id);
          }
        }
      }
    }
    // Keep the original log order so lanes stay stable.
    filteredCommits.sort((a, b) => commits.indexOf(a) - commits.indexOf(b));

    // Assign columns using greedy topological lane allocation
    filteredCommits.forEach((commit, rowIndex) => {
      let laneIndex = activeLanes.indexOf(commit.change_id);
      if (laneIndex === -1) {
        laneIndex = activeLanes.indexOf(commit.id);
      }
      if (laneIndex === -1) {
        laneIndex = activeLanes.indexOf(null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(null);
        }
      }

      const color = commit.is_working_copy
        ? '#89b4fa'
        : commit.is_conflict
        ? '#f38ba8'
        : PALETTE[laneIndex % PALETTE.length];

      const node: LayoutNode = {
        commit,
        x: leftMargin + laneIndex * colWidth,
        y: topMargin + rowIndex * rowHeight,
        col: laneIndex,
        row: rowIndex,
        color,
      };

      computedNodes.push(node);
      idToNodeMap.set(commit.change_id, node);
      idToNodeMap.set(commit.id, node);
      idToNodeMap.set(commit.short_change_id, node);

      // Update lanes for parent commits. A parent that already occupies
      // another lane is NOT duplicated: the child's lane is freed instead.
      // Duplicating it (the old behaviour) left an orphan lane that never
      // got released after a diamond merge.
      activeLanes[laneIndex] = null;
      if (commit.parents && commit.parents.length > 0) {
        const firstParent = commit.parents[0];
        if (activeLanes.includes(firstParent)) {
          activeLanes[laneIndex] = null;
        } else {
          activeLanes[laneIndex] = firstParent;
        }
        for (let p = 1; p < commit.parents.length; p++) {
          const pId = commit.parents[p];
          if (!activeLanes.includes(pId)) {
            const nextEmpty = activeLanes.indexOf(null);
            if (nextEmpty !== -1) {
              activeLanes[nextEmpty] = pId;
            } else {
              activeLanes.push(pId);
            }
          }
        }
      }
    });

    // Compute Bezier edge curves
    const computedEdges: {
      id: string;
      path: string;
      color: string;
      isDashed: boolean;
    }[] = [];

    computedNodes.forEach(childNode => {
      childNode.commit.parents?.forEach(parentId => {
        const parentNode = idToNodeMap.get(parentId);
        if (parentNode) {
          const x1 = childNode.x;
          const y1 = childNode.y;
          const x2 = parentNode.x;
          const y2 = parentNode.y;

          let pathData = '';
          if (x1 === x2) {
            // Straight vertical line
            pathData = `M ${x1} ${y1} L ${x2} ${y2}`;
          } else {
            // Smooth cubic bezier spline
            const midY = (y1 + y2) / 2;
            pathData = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
          }

          computedEdges.push({
            id: `edge-${childNode.commit.change_id}-${parentNode.commit.change_id}`,
            path: pathData,
            color: childNode.color,
            isDashed: Boolean(childNode.commit.is_empty),
          });
        }
      });
    });

    const maxLane = Math.max(0, ...computedNodes.map(n => n.col));
    const height = Math.max(400, topMargin + filteredCommits.length * rowHeight + 40);

    return {
      nodes: computedNodes,
      edges: computedEdges,
      maxCol: maxLane,
      totalHeight: height,
    };
  }, [commits, filterQuery, showOnlyBookmarks]);

  const graphWidth = Math.max(140, 50 + (maxCol + 1) * 28);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] border-r border-[#313244] select-none">
      {/* Header Controls */}
      <div className="p-3 border-b border-[#313244] bg-[#181825] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#89b4fa]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[#585b70]">
              {t('graph_header')}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#313244] text-[#bac2de]">
              {nodes.length} {t('graph_revs')}
            </span>
          </div>

          <button
            onClick={() => setShowOnlyBookmarks(!showOnlyBookmarks)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
              showOnlyBookmarks
                ? 'bg-[#89b4fa]/20 text-[#89b4fa] border border-[#89b4fa]/40'
                : 'bg-[#313244]/50 text-[#bac2de] hover:text-[#cdd6f4] hover:bg-[#313244]'
            }`}
            title={t('graph_only_bookmarks')}
          >
            <Bookmark className="w-3 h-3" />
            <span>{t('graph_bookmarks')}</span>
          </button>
        </div>

        {/* Search / Revset Filter Input */}
        <div className="relative">
          <input
            type="text"
            placeholder={t('graph_search_placeholder')}
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            className="w-full bg-[#11111b] border border-[#313244] rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa] transition-colors"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-2 top-1.5 text-xs text-[#585b70] hover:text-[#cdd6f4]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Interactive Scrollable Canvas / SVG Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#181825]/50 scrollbar-thin scrollbar-thumb-[#313244] scrollbar-track-transparent">
        {nodes.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[#585b70]">
            <GitCommit className="w-8 h-8 mb-2 opacity-40" />
            {loading ? (
              <p className="text-xs font-semibold text-[#cdd6f4]">{t('graph_loading')}</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-[#cdd6f4]">{t('graph_empty_title')}</p>
                <p className="text-[11px] text-[#585b70] mt-1">{t('graph_empty_desc')}</p>
              </>
            )}
            <button
              onClick={() => {
                setFilterQuery('');
                setShowOnlyBookmarks(false);
              }}
              className="mt-2 text-xs text-[#89b4fa] hover:underline"
            >
              {t('graph_all_commits')}
            </button>
          </div>
        ) : (
          <div className="relative" style={{ height: totalHeight }}>
            {/* SVG Graph Overlay (Edges & Nodes) */}
            <svg
              className="absolute left-0 top-0 pointer-events-none z-10"
              width={graphWidth}
              height={totalHeight}
            >
              <defs>
                <filter id="working-copy-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#89b4fa" floodOpacity="0.8" />
                </filter>
                <filter id="selected-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#cba6f7" floodOpacity="0.7" />
                </filter>
              </defs>

              {/* Render Connection Lines */}
              {edges.map(edge => (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth="2.5"
                  strokeOpacity="0.65"
                  strokeDasharray={edge.isDashed ? '4 3' : undefined}
                />
              ))}

              {/* Render Node Circles */}
              {nodes.map(node => {
                const isSelected = selectedCommit?.change_id === node.commit.change_id;
                const isWc = node.commit.is_working_copy;

                return (
                  <g key={`node-${node.commit.change_id}`}>
                    {/* Pulsing ring for working copy (@) */}
                    {isWc && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="12"
                        fill="none"
                        stroke="#89b4fa"
                        strokeWidth="1.5"
                        className="animate-ping opacity-30"
                      />
                    )}

                    {/* Outer glow ring for selection */}
                    {isSelected && !isWc && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="11"
                        fill="none"
                        stroke="#cba6f7"
                        strokeWidth="2"
                        filter="url(#selected-glow)"
                      />
                    )}

                    {/* Main Node Body */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isWc ? 9 : 6.5}
                      fill={isWc ? '#89b4fa' : node.color}
                      stroke="#11111b"
                      strokeWidth={isWc ? 3 : 2}
                      filter={isWc ? 'url(#working-copy-glow)' : undefined}
                    />

                    {/* Working copy (@) glyph or empty glyph */}
                    {isWc && (
                      <text
                        x={node.x}
                        y={node.y + 3.5}
                        fontSize="9"
                        fontWeight="bold"
                        fill="#11111b"
                        textAnchor="middle"
                      >
                        @
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Interactive Row Cards alongside the graph */}
            <div className="absolute inset-0 flex flex-col pointer-events-auto">
              {nodes.map(node => {
                const { commit, y } = node;
                const isSelected = selectedCommit?.change_id === commit.change_id;
                const isWc = commit.is_working_copy;

                return (
                  <div
                    key={commit.change_id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${commit.short_change_id} ${commit.description || '(sin descripción)'}`}
                    onClick={() => onSelectCommit(commit)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectCommit(commit);
                      }
                    }}
                    style={{
                      top: y - 28,
                      height: 58,
                      paddingLeft: graphWidth + 8,
                    }}
                    className={`absolute right-2 left-0 flex items-center pr-3 rounded-lg cursor-pointer transition-all duration-150 group border ${
                      isSelected
                        ? 'bg-[#313244]/90 border-[#89b4fa]/60 shadow-md shadow-black/40'
                        : isWc
                        ? 'bg-[#181825]/90 border-[#89b4fa]/30 hover:border-[#89b4fa]/60'
                        : 'bg-transparent border-transparent hover:bg-[#181825]/60 hover:border-[#313244]'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      {/* Top Row: IDs, Badges, Bookmarks */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {/* Working Copy Badge */}
                        {isWc && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#89b4fa] text-[#11111b] uppercase tracking-wider">
                            <Sparkles className="w-2.5 h-2.5" />
                            {t('graph_badge_working_copy')}
                          </span>
                        )}

                        {/* Immutable Root Indicator */}
                        {commit.is_immutable && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#313244] text-[#bac2de]">
                            <Shield className="w-2.5 h-2.5" />
                            {t('graph_badge_immutable')}
                          </span>
                        )}

                        {/* Conflict Warning */}
                        {commit.is_conflict && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#f38ba8]/20 text-[#f38ba8] border border-[#f38ba8]/40">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {t('graph_badge_conflict')}
                          </span>
                        )}

                        {/* Change ID (Jujutsu key concept) */}
                        <span className="font-mono text-xs font-semibold text-[#89b4fa] bg-[#11111b] px-1.5 py-0.5 rounded border border-[#313244]">
                          {commit.short_change_id}
                        </span>

                        {/* Commit ID (Hex) */}
                        <span className="font-mono text-[11px] text-[#585b70] group-hover:text-[#bac2de] transition-colors">
                          {commit.short_id}
                        </span>

                        {/* Bookmarks / Branches */}
                        {commit.bookmarks?.map(b => (
                          <span
                            key={b}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#a6e3a1]/15 text-[#a6e3a1] border border-[#a6e3a1]/30"
                          >
                            <Bookmark className="w-2.5 h-2.5" />
                            {b}
                          </span>
                        ))}

                        {commit.branches?.map(br => (
                          <span
                            key={br}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#cba6f7]/15 text-[#cba6f7] border border-[#cba6f7]/30"
                          >
                            <GitBranch className="w-2.5 h-2.5" />
                            {br}
                          </span>
                        ))}
                      </div>

                      {/* Commit Description */}
                      <p
                        className={`text-xs truncate font-medium ${
                          commit.description
                            ? 'text-[#cdd6f4]'
                            : 'text-[#585b70] italic'
                        }`}
                      >
                        {commit.description || <span className="text-[#585b70] italic">{t('status_no_description')}</span>}
                      </p>

                      {/* Meta Footer: Author & Date */}
                      <div className="flex items-center gap-3 text-[10px] text-[#585b70] mt-0.5">
                        <span className="flex items-center gap-1 truncate max-w-[130px]">
                          <User className="w-2.5 h-2.5" />
                          {commit.author.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {commit.timestamp || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="px-3 py-2 border-t border-[#313244] bg-[#11111b] text-[11px] text-[#585b70] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#89b4fa] inline-block shadow-sm shadow-[#89b4fa]" />
            <span className="text-[#cdd6f4]">@ {t('working_copy_label')}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#a6e3a1] inline-block" />
            <span>{t('graph_commit_label')}</span>
          </span>
          <span className="flex items-center gap-1">
            <Bookmark className="w-2.5 h-2.5 text-[#a6e3a1]" />
            <span>{t('graph_bookmarks')}</span>
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#585b70]">jj log -r all()</span>
      </div>
    </div>
  );
}
