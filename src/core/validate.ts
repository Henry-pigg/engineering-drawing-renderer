import type {
  ArcPrimitive,
  CirclePrimitive,
  DimensionPrimitive,
  DrawingDoc,
  DrawingMeta,
  LinePrimitive,
  LineType,
  Point,
  Primitive,
  Step,
} from '../types';
import { parseJsonLoose } from './json';

/**
 * 模型输出 → 可渲染文档 的兜底层。
 *
 * 设计前提：**永远不要相信大模型的 JSON 是干净的**。
 * 实测常见问题，这里逐条兜住：
 *   · 整段套了 ```json 围栏            → parseJsonLoose 剥壳
 *   · 缺 id / id 重复                   → 自动生成、加后缀
 *   · 坐标超界、负数                    → 夹到安全区并记 warn（不丢图元，学生还能看到）
 *   · r <= 0、零长度直线、起止角相同     → 丢弃（画出来是脏点，不如不画）
 *   · lineType 写成 "粗实线"/"solid"     → 归一化到合法枚举
 *   · step 缺 narration、primitives 为空 → 补文案或整步跳过
 *
 * 原则：**能修就修，修完告诉调用方；不能修才丢。**
 */

export type IssueLevel = 'error' | 'warn' | 'info';

export interface ValidationIssue {
  level: IssueLevel;
  /** 出问题的位置，如 steps[2].primitives[1] */
  path: string;
  message: string;
  /** 是否已被自动修复 */
  fixed?: boolean;
}

export interface NormalizeOptions {
  width?: number;
  height?: number;
  /** 安全区边距，坐标会被夹在这之内 */
  padding?: number;
  maxSteps?: number;
  maxPrimitivesPerStep?: number;
  maxTotalPrimitives?: number;
}

export interface NormalizeResult {
  /** 完全无法解析时为 null */
  doc: DrawingDoc | null;
  issues: ValidationIssue[];
}

const DEFAULT_WIDTH = 920;
const DEFAULT_HEIGHT = 660;
const DEFAULT_PADDING = 40;

const LINE_TYPE_ALIASES: Record<string, LineType> = {
  thick: 'thick',
  thin: 'thin',
  dashed: 'dashed',
  center: 'center',
  // 模型偶尔会吐中文或英文描述
  粗实线: 'thick',
  细实线: 'thin',
  细虚线: 'dashed',
  虚线: 'dashed',
  点画线: 'center',
  细点画线: 'center',
  中心线: 'center',
  solid: 'thick',
  hidden: 'dashed',
  dashdot: 'center',
};

const ORIENTATIONS = ['aligned', 'horizontal', 'vertical'] as const;

/** 模型漏写尺寸文字时，按量测方式补一个数值，保证 doc 仍满足 schema（text 必填） */
function defaultDimensionText(
  from: Point,
  to: Point,
  orientation?: DimensionPrimitive['orientation'],
): string {
  let value: number;
  if (orientation === 'horizontal') value = Math.abs(to.x - from.x);
  else if (orientation === 'vertical') value = Math.abs(to.y - from.y);
  else value = Math.hypot(to.x - from.x, to.y - from.y);
  return String(Math.round(value * 10) / 10);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toText(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function pickLineType(v: unknown, fallback: LineType = 'thick'): LineType {
  if (typeof v !== 'string') return fallback;
  const hit = LINE_TYPE_ALIASES[v.trim()] ?? LINE_TYPE_ALIASES[v.trim().toLowerCase()];
  return hit ?? fallback;
}

export function normalizeDrawingDoc(raw: unknown, options: NormalizeOptions = {}): NormalizeResult {
  const issues: ValidationIssue[] = [];
  const payload = parseJsonLoose(raw);

  if (!isRecord(payload)) {
    issues.push({ level: 'error', path: '$', message: '无法从模型输出中解析出 JSON 对象' });
    return { doc: null, issues };
  }

  /* ---------- 画布 ---------- */
  const metaRaw = isRecord(payload.meta) ? payload.meta : {};
  const width = toNumber(metaRaw.width) ?? DEFAULT_WIDTH;
  const height = toNumber(metaRaw.height) ?? DEFAULT_HEIGHT;
  const padding = options.padding ?? DEFAULT_PADDING;
  const bounds = {
    minX: padding,
    maxX: Math.max(padding + 1, width - padding),
    minY: padding,
    maxY: Math.max(padding + 1, height - padding),
  };
  const maxSteps = options.maxSteps ?? 16;
  const maxPerStep = options.maxPrimitivesPerStep ?? 12;
  const maxTotal = options.maxTotalPrimitives ?? 90;

  /* ---------- 步骤 ---------- */
  const rawSteps = payload.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    issues.push({ level: 'error', path: '$.steps', message: 'steps 缺失或为空，无法渲染任何内容' });
    return { doc: null, issues };
  }

  const usedIds = new Set<string>();
  const uniqueId = (candidate: string, fallback: string): string => {
    let id = candidate && !usedIds.has(candidate) ? candidate : fallback;
    let n = 2;
    while (usedIds.has(id)) {
      id = `${fallback}-${n}`;
      n += 1;
    }
    usedIds.add(id);
    return id;
  };

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const readPoint = (v: unknown, path: string): Point | null => {
    if (!isRecord(v)) {
      issues.push({ level: 'error', path, message: '坐标点缺失，图元已丢弃' });
      return null;
    }
    const x = toNumber(v.x);
    const y = toNumber(v.y);
    if (x === null || y === null) {
      issues.push({ level: 'error', path, message: '坐标数值非法，图元已丢弃' });
      return null;
    }
    const cx = clamp(x, bounds.minX, bounds.maxX);
    const cy = clamp(y, bounds.minY, bounds.maxY);
    if (cx !== x || cy !== y) {
      issues.push({
        level: 'warn',
        path,
        message: `坐标 (${x}, ${y}) 超出画布，已夹到安全区 (${Math.round(cx)}, ${Math.round(cy)})`,
        fixed: true,
      });
    }
    return { x: cx, y: cy };
  };

  const primitives: Step[] = [];
  let total = 0;
  let droppedSteps = 0;

  const rawStepList = rawSteps.slice(0, maxSteps);
  if (rawSteps.length > maxSteps) {
    issues.push({
      level: 'warn',
      path: '$.steps',
      message: `步骤数 ${rawSteps.length} 超过上限 ${maxSteps}，已截断`,
      fixed: true,
    });
  }

  rawStepList.forEach((rawStep, si) => {
    const stepPath = `steps[${si}]`;
    if (!isRecord(rawStep)) {
      droppedSteps += 1;
      return;
    }

    const stepId = uniqueId(toText(rawStep.id) ?? '', `s${si + 1}`);
    const rawPrims = Array.isArray(rawStep.primitives) ? rawStep.primitives : [];
    if (rawPrims.length === 0) {
      issues.push({ level: 'warn', path: `${stepPath}.primitives`, message: '该步骤没有图元，已跳过' });
      droppedSteps += 1;
      return;
    }

    const list: Primitive[] = [];
    rawPrims.slice(0, maxPerStep).forEach((rawPrim, pi) => {
      const path = `${stepPath}.primitives[${pi}]`;
      if (total >= maxTotal) return;
      if (!isRecord(rawPrim)) return;

      const kind = toText(rawPrim.kind);
      const fallbackId = `${stepId}-e${pi + 1}`;
      const id = uniqueId(toText(rawPrim.id) ?? '', fallbackId);
      const lineType = pickLineType(rawPrim.lineType);

      switch (kind) {
        case 'line': {
          const x1 = toNumber(rawPrim.x1);
          const y1 = toNumber(rawPrim.y1);
          const x2 = toNumber(rawPrim.x2);
          const y2 = toNumber(rawPrim.y2);
          if (x1 === null || y1 === null || x2 === null || y2 === null) {
            issues.push({ level: 'warn', path, message: '直线端点非法，已丢弃' });
            return;
          }
          const p1 = { x: clamp(x1, bounds.minX, bounds.maxX), y: clamp(y1, bounds.minY, bounds.maxY) };
          const p2 = { x: clamp(x2, bounds.minX, bounds.maxX), y: clamp(y2, bounds.minY, bounds.maxY) };
          if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1) {
            issues.push({ level: 'warn', path, message: '零长度直线，已丢弃' });
            return;
          }
          const prim: LinePrimitive = {
            id,
            kind: 'line',
            lineType,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
          };
          list.push(prim);
          break;
        }

        case 'circle': {
          const cx = toNumber(rawPrim.cx);
          const cy = toNumber(rawPrim.cy);
          const r = toNumber(rawPrim.r);
          if (cx === null || cy === null || r === null || r <= 0) {
            issues.push({ level: 'warn', path, message: '圆参数非法（r 必须 > 0），已丢弃' });
            return;
          }
          const prim: CirclePrimitive = {
            id,
            kind: 'circle',
            lineType,
            cx: clamp(cx, bounds.minX, bounds.maxX),
            cy: clamp(cy, bounds.minY, bounds.maxY),
            r,
          };
          if (cx - r < 0 || cx + r > width || cy - r < 0 || cy + r > height) {
            issues.push({
              level: 'warn',
              path,
              message: `圆 r=${Math.round(r)} 超出画布边界，可能被裁切`,
            });
          }
          list.push(prim);
          break;
        }

        case 'arc': {
          const cx = toNumber(rawPrim.cx);
          const cy = toNumber(rawPrim.cy);
          const r = toNumber(rawPrim.r);
          let startAngle = toNumber(rawPrim.startAngle);
          let endAngle = toNumber(rawPrim.endAngle);
          if (cx === null || cy === null || r === null || r <= 0) {
            issues.push({ level: 'warn', path, message: '圆弧参数非法（r 必须 > 0），已丢弃' });
            return;
          }
          if (startAngle === null) {
            startAngle = 0;
            issues.push({ level: 'warn', path, message: '缺少 startAngle，按 0° 处理', fixed: true });
          }
          if (endAngle === null) {
            endAngle = startAngle + 180;
            issues.push({
              level: 'warn',
              path,
              message: '缺少 endAngle，按半圆处理',
              fixed: true,
            });
          }
          if (Math.abs(endAngle - startAngle) < 0.5) {
            issues.push({ level: 'warn', path, message: '圆弧起止角相同，已丢弃' });
            return;
          }
          const prim: ArcPrimitive = {
            id,
            kind: 'arc',
            lineType,
            cx: clamp(cx, bounds.minX, bounds.maxX),
            cy: clamp(cy, bounds.minY, bounds.maxY),
            r,
            startAngle: clamp(startAngle, -360, 360),
            endAngle: clamp(endAngle, -360, 360),
          };
          list.push(prim);
          break;
        }

        case 'dimension': {
          const from = readPoint(rawPrim.from, `${path}.from`);
          const to = readPoint(rawPrim.to, `${path}.to`);
          if (!from || !to) return;
          if (Math.hypot(to.x - from.x, to.y - from.y) < 2) {
            issues.push({ level: 'warn', path, message: '尺寸起止点重合，已丢弃' });
            return;
          }
          const orientationRaw = toText(rawPrim.orientation);
          const orientation = (ORIENTATIONS as readonly string[]).includes(orientationRaw ?? '')
            ? (orientationRaw as DimensionPrimitive['orientation'])
            : undefined;
          const text = toText(rawPrim.text);
          if (!text) {
            issues.push({
              level: 'info',
              path,
              message: '尺寸缺少 text，已按测量值补全（缺少 Ø/R 前缀，建议模型补上）',
              fixed: true,
            });
          }
          const prim: DimensionPrimitive = {
            id,
            kind: 'dimension',
            lineType: 'thin',
            from,
            to,
            offset: toNumber(rawPrim.offset) ?? 24,
            text: text ?? defaultDimensionText(from, to, orientation),
          };
          // 可选字段仅在存在时写入：留一个 undefined 键会让 strict JSON Schema 校验失败
          if (orientation) prim.orientation = orientation;
          list.push(prim);
          break;
        }

        default:
          issues.push({
            level: 'warn',
            path,
            message: `未知图元 kind「${kind ?? 'undefined'}」，已跳过（仅支持 line/circle/arc/dimension）`,
          });
          return;
      }

      total += 1;
    });

    if (list.length === 0) {
      issues.push({ level: 'warn', path: stepPath, message: '该步骤所有图元均非法，整步跳过' });
      droppedSteps += 1;
      return;
    }

    const title = toText(rawStep.title) ?? `第 ${si + 1} 步`;
    const narration = toText(rawStep.narration);
    if (!narration) {
      issues.push({
        level: 'info',
        path: `${stepPath}.narration`,
        message: '缺少讲解文案，教学价值会打折',
      });
    }

    primitives.push({
      id: stepId,
      title,
      narration,
      primitives: list,
    });
  });

  if (primitives.length === 0) {
    issues.push({ level: 'error', path: '$.steps', message: '没有任何合法步骤，无法渲染' });
    return { doc: null, issues };
  }

  /* ---------- meta ---------- */
  const confidenceRaw = toNumber(metaRaw.confidence);
  const warningsRaw = Array.isArray(payload.warnings) ? payload.warnings : [];
  const warnings = warningsRaw
    .map((w) => toText(w))
    .filter((w): w is string => Boolean(w))
    .slice(0, 8);

  const meta: DrawingMeta = {
    title: toText(metaRaw.title) ?? '未命名零件',
    unit: 'mm',
    width,
    height,
  };
  const standard = toText(metaRaw.standard);
  if (standard) meta.standard = standard;
  const summary = toText(metaRaw.summary);
  if (summary) meta.summary = summary;
  if (confidenceRaw !== null) meta.confidence = Math.min(1, Math.max(0, confidenceRaw));

  const doc: DrawingDoc = {
    version: '1.0',
    meta,
    steps: primitives,
  };
  if (warnings.length > 0) doc.warnings = warnings;

  if (droppedSteps > 0) {
    issues.push({
      level: 'info',
      path: '$.steps',
      message: `共跳过 ${droppedSteps} 个无效步骤`,
    });
  }

  return { doc, issues };
}
