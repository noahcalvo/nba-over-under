"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatGameDate, formatNumber } from "@/lib/format";
import type { ChartModel, ChartPoint } from "@/lib/game-log/chart-model";
import type { TeamId } from "@/lib/types";

const MARGIN = { top: 34, right: 16, bottom: 46, left: 50 };
const FULL_SEASON_TICKS = [1, 10, 20, 30, 40, 50, 60, 70, 82];
const DASH = "7 6";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function linePath(points: Array<[number, number]>): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

export function SeasonProgressChart({
  model,
  teamNames,
}: {
  model: ChartModel;
  teamNames: Readonly<Record<TeamId, string>>;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const { window: range, points, axis, mode } = model;
  const zoomed = mode === "last8";
  const height = width > 0 && width < 640 ? 260 : 300;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const steps = Math.max(1, range.last - range.first);
  const x = (game: number) =>
    MARGIN.left + (range.last === range.first ? plotWidth / 2 : ((game - range.first) / steps) * plotWidth);
  const y = (wins: number) => MARGIN.top + (1 - (wins - axis.min) / (axis.max - axis.min)) * plotHeight;
  const column = range.last === range.first ? plotWidth : plotWidth / steps;
  const bottom = MARGIN.top + plotHeight;

  const series = (key: "actual" | "pace" | "projected") =>
    points.filter((point) => point[key] !== null).map((point): [number, number] => [x(point.game), y(point[key]!)]);
  const actual = series("actual");
  const pace = series("pace");
  const projected = series("projected");
  const current = points.find((point) => point.game === range.current) ?? null;
  const showNow = zoomed && range.current >= range.first && range.current >= 1;
  const upcomingStart =
    zoomed && range.upcoming > 0 ? (range.current >= range.first ? x(range.current + 0.5) : MARGIN.left) : null;
  const xTicks = zoomed ? points.map((point) => point.game) : FULL_SEASON_TICKS;
  const activePoint = active === null ? null : (points.find((point) => point.game === active) ?? null);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") return setActive(null);
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const start = active ?? Math.max(range.first, Math.min(range.current, range.last));
    const next = start + (event.key === "ArrowRight" ? 1 : -1);
    setActive(Math.min(range.last, Math.max(range.first, next)));
  }

  const summary = describe(model, current);
  return (
    <div ref={containerRef} className="relative mt-4 w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((value) => value ?? Math.max(range.first, Math.min(range.current, range.last)))}
          onBlur={() => setActive(null)}
          onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
          className="block touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          {upcomingStart !== null && (
            <>
              <rect
                x={upcomingStart}
                y={MARGIN.top}
                width={Math.max(0, MARGIN.left + plotWidth - upcomingStart)}
                height={plotHeight}
                className="fill-fog-50/[0.04]"
              />
              <text
                x={(upcomingStart + MARGIN.left + plotWidth) / 2}
                y={MARGIN.top - 12}
                textAnchor="middle"
                fontSize={12}
                className="fill-fog-300"
              >
                Upcoming
              </text>
            </>
          )}

          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} className="stroke-ink-700" />
              <text x={MARGIN.left - 10} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={12} className="fill-fog-300">
                {formatNumber(tick, 0)}
              </text>
            </g>
          ))}
          {zoomed &&
            points.map((point) => (
              <line key={point.game} x1={x(point.game)} x2={x(point.game)} y1={MARGIN.top} y2={bottom} className="stroke-ink-700/60" />
            ))}
          {xTicks.map((game) => (
            <text
              key={game}
              x={x(game)}
              y={bottom + 18}
              textAnchor="middle"
              fontSize={12}
              fontWeight={zoomed && game === range.current ? 700 : 400}
              className={zoomed && game === range.current ? "fill-progress" : "fill-fog-300"}
            >
              {game}
            </text>
          ))}
          <text x={MARGIN.left + plotWidth / 2} y={height - 4} textAnchor="middle" fontSize={13} className="fill-fog-300">
            Games played
          </text>
          <text
            transform={`translate(14 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={13}
            className="fill-fog-300"
          >
            Wins
          </text>

          {showNow && (
            <g>
              <line x1={x(range.current)} x2={x(range.current)} y1={MARGIN.top - 4} y2={bottom} strokeDasharray="4 4" className="stroke-progress/70" />
              <rect x={x(range.current) - 22} y={MARGIN.top - 26} width={44} height={20} rx={4} className="fill-ink-700" />
              <text x={x(range.current)} y={MARGIN.top - 12} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-progress">
                Now
              </text>
            </g>
          )}

          {actual.length > 1 && (
            <path
              d={`${linePath(actual)}L${actual[actual.length - 1][0].toFixed(1)},${bottom}L${actual[0][0].toFixed(1)},${bottom}Z`}
              className="fill-progress/10"
            />
          )}
          {pace.length > 0 && (
            <path d={linePath(pace)} fill="none" strokeWidth={2.5} strokeDasharray={DASH} className="stroke-fog-300" />
          )}
          {projected.length > 1 && (
            <path d={linePath(projected)} fill="none" strokeWidth={2.5} strokeDasharray={DASH} className="stroke-progress" />
          )}
          {actual.length > 0 && (
            <path d={linePath(actual)} fill="none" strokeWidth={3} strokeLinejoin="round" className="stroke-progress" />
          )}

          {points.map((point) => {
            const showActual = point.actual !== null && (zoomed || point.game === range.current);
            const showProjected = zoomed && point.projected !== null && point.game > range.current;
            const big = point.game === active;
            return (
              <g key={point.game}>
                {showActual && (
                  <circle cx={x(point.game)} cy={y(point.actual!)} r={big ? 7 : 5} strokeWidth={2} className="fill-progress stroke-ink-850" />
                )}
                {showProjected && (
                  <circle cx={x(point.game)} cy={y(point.projected!)} r={big ? 6 : 4.5} strokeWidth={2} className="fill-progress stroke-ink-850" />
                )}
              </g>
            );
          })}

          {activePoint && (
            <line x1={x(activePoint.game)} x2={x(activePoint.game)} y1={MARGIN.top} y2={bottom} className="stroke-fog-400/60" />
          )}

          {points.map((point) => (
            <rect
              key={point.game}
              x={x(point.game) - column / 2}
              y={MARGIN.top}
              width={column}
              height={plotHeight}
              fill="transparent"
              onPointerEnter={() => setActive(point.game)}
              onPointerDown={() => setActive(point.game)}
            />
          ))}
        </svg>
      )}
      {activePoint && width > 0 && (
        <Tooltip point={activePoint} teamNames={teamNames} left={Math.min(Math.max(x(activePoint.game), 90), width - 90)} />
      )}
    </div>
  );
}

function Tooltip({
  point,
  teamNames,
  left,
}: {
  point: ChartPoint;
  teamNames: Readonly<Record<TeamId, string>>;
  left: number;
}) {
  const { detail } = point;
  const opponent = detail?.opponentId ? teamNames[detail.opponentId] : null;
  const where = detail?.home === true ? "vs " : detail?.home === false ? "@ " : "";
  const result = detail?.result === "W" ? "Win" : detail?.result === "L" ? "Loss" : null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm shadow-lg"
      style={{ left }}
    >
      <p className="font-semibold text-fog-50">
        Game {point.game}
        {detail?.date && <span className="font-normal text-fog-300"> · {formatGameDate(detail.date)}</span>}
      </p>
      {(opponent || result) && (
        <p className="text-fog-300">{[opponent && `${where}${opponent}`, result].filter(Boolean).join(" · ")}</p>
      )}
      <dl className="mt-1 space-y-0.5">
        {point.actual !== null && <Line label="Actual wins" value={formatNumber(point.actual, 0)} />}
        {point.pace !== null && <Line label="Locked-line pace" value={formatNumber(point.pace)} />}
        {point.projected !== null && <Line label="Projected wins" value={formatNumber(point.projected)} />}
      </dl>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fog-300">{label}</dt>
      <dd className="font-semibold tabular-nums text-fog-50">{value}</dd>
    </div>
  );
}

function describe(model: ChartModel, current: ChartPoint | null): string {
  const parts = [`Cumulative wins, games ${model.window.first}–${model.window.last}.`];
  if (current?.actual != null) parts.push(`${current.actual} wins after game ${current.game}.`);
  if (current?.pace != null) parts.push(`Locked-line pace ${formatNumber(current.pace)}.`);
  if (current?.projected != null && model.points.at(-1)?.projected != null) {
    parts.push(`Projected ${formatNumber(model.points.at(-1)!.projected!)} by game ${model.window.last}.`);
  }
  return parts.join(" ");
}
