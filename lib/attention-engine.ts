export type FreshnessStatus =
  | 'LIVE'
  | 'DELAYED'
  | 'STALE'
  | 'CONFLICTED'
  | 'UNAVAILABLE';

export type Priority = 'needs_attention' | 'worth_noting' | 'quiet';

export type AssessmentInput = {
  currentPrice: number;
  baselinePrice: number | null;
  volume: number;
  averageVolume20d: number;
  benchmarkReturn: number;
  normalDailyVolatility: number;
  high52w: number;
  low52w: number;
  eventTitle: string | null;
  freshnessStatus: FreshnessStatus;
  confidenceStatus: string;
  priceThreshold: number;
  volumeThreshold: number;
};

export type ScoreComponent = {
  key: string;
  label: string;
  points: number;
  detail: string;
};

export type Assessment = {
  score: number;
  priority: Priority;
  returnSinceSeen: number | null;
  relativeMove: number | null;
  volumeRatio: number;
  volatilityScore: number | null;
  components: ScoreComponent[];
  explanations: string[];
  headline: string;
  expected: boolean;
};

const confidenceMultiplier: Record<FreshnessStatus, number> = {
  LIVE: 1,
  DELAYED: 0.85,
  STALE: 0.55,
  CONFLICTED: 0.6,
  UNAVAILABLE: 0.3,
};

export const ATTENTION_THRESHOLDS = {
  needsAttention: 75,
  worthNoting: 45,
  providerConflictTolerance: 0.008,
};

const pct = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

export function assessChange(input: AssessmentInput): Assessment {
  const volumeRatio = input.volume / Math.max(input.averageVolume20d, 1);

  if (input.baselinePrice === null) {
    return {
      score: 20,
      priority: 'quiet',
      returnSinceSeen: null,
      relativeMove: null,
      volumeRatio,
      volatilityScore: null,
      components: [
        {
          key: 'baseline',
          label: 'Baseline required',
          points: 20,
          detail: 'Review once to start a personal comparison checkpoint.',
        },
      ],
      explanations: ['No previous review baseline exists yet.'],
      headline: 'Ready for a first checkpoint',
      expected: false,
    };
  }

  const returnSinceSeen =
    (input.currentPrice - input.baselinePrice) / input.baselinePrice;
  const relativeMove = returnSinceSeen - input.benchmarkReturn;
  const volatilityScore =
    Math.abs(returnSinceSeen) / Math.max(input.normalDailyVolatility, 0.01);
  const pricePoints = Math.min(30, volatilityScore * 18);
  const volumePoints = Math.min(25, Math.max(0, volumeRatio - 1) * 18);
  const relativePoints = Math.min(20, Math.abs(relativeMove) * 400);
  const brokeHigh = input.currentPrice >= input.high52w;
  const brokeLow = input.currentPrice <= input.low52w;
  const levelPoints = brokeHigh || brokeLow ? 12 : 0;
  const eventPoints = input.eventTitle ? 13 : 0;
  const passedPersonalRule =
    Math.abs(returnSinceSeen) >= input.priceThreshold ||
    volumeRatio >= input.volumeThreshold;
  const noveltyPoints = passedPersonalRule ? 5 : 0;
  const unexpected =
    !input.eventTitle && volatilityScore >= 2 && volumeRatio >= 2;
  const unexpectedPoints = unexpected ? 8 : 0;

  const components: ScoreComponent[] = [
    {
      key: 'price',
      label: 'Price unusualness',
      points: Math.round(pricePoints),
      detail: `${volatilityScore.toFixed(1)}× this stock’s normal move`,
    },
    {
      key: 'volume',
      label: 'Volume anomaly',
      points: Math.round(volumePoints),
      detail: `${volumeRatio.toFixed(1)}× its 20-day average`,
    },
    {
      key: 'relative',
      label: 'Market-relative move',
      points: Math.round(relativePoints),
      detail: `${pct(relativeMove)} beyond its benchmark`,
    },
  ];

  if (levelPoints) {
    components.push({
      key: 'level',
      label: 'Key level crossed',
      points: levelPoints,
      detail: brokeHigh
        ? 'Moved above its 52-week high'
        : 'Moved below its 52-week low',
    });
  }
  if (eventPoints) {
    components.push({
      key: 'event',
      label: 'New corporate event',
      points: eventPoints,
      detail: input.eventTitle ?? '',
    });
  }
  if (unexpectedPoints) {
    components.push({
      key: 'unexpected',
      label: 'Unexpectedness',
      points: unexpectedPoints,
      detail: 'No scheduled event explains the unusual move',
    });
  }
  if (noveltyPoints) {
    components.push({
      key: 'personal',
      label: 'Personal rule matched',
      points: noveltyPoints,
      detail: `Above your ${(input.priceThreshold * 100).toFixed(1)}% or ${input.volumeThreshold.toFixed(1)}× threshold`,
    });
  }

  const rawScore = components.reduce(
    (sum, component) => sum + component.points,
    0,
  );
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(rawScore * confidenceMultiplier[input.freshnessStatus]),
    ),
  );
  const priority: Priority =
    score >= ATTENTION_THRESHOLDS.needsAttention
      ? 'needs_attention'
      : score >= ATTENTION_THRESHOLDS.worthNoting
        ? 'worth_noting'
        : 'quiet';

  const explanations: string[] = [];
  explanations.push(`${pct(returnSinceSeen)} since your last review`);
  if (volatilityScore >= 1.5) {
    explanations.push(
      `The move is ${volatilityScore.toFixed(1)}× its normal range`,
    );
  }
  if (volumeRatio >= input.volumeThreshold) {
    explanations.push(
      `Volume is ${volumeRatio.toFixed(1)}× its 20-day average`,
    );
  }
  if (Math.abs(relativeMove) >= 0.01) {
    explanations.push(`${pct(relativeMove)} beyond its benchmark`);
  }
  if (brokeHigh || brokeLow) {
    explanations.push(
      brokeHigh ? 'Crossed its 52-week high' : 'Broke its 52-week low',
    );
  }
  if (input.eventTitle) explanations.push(input.eventTitle);
  if (input.freshnessStatus !== 'LIVE') {
    explanations.push(
      `Confidence reduced: data is ${input.freshnessStatus.toLowerCase()}`,
    );
  }

  let headline = 'No meaningful change';
  if (unexpected) headline = 'Unexpected movement detected';
  else if (brokeHigh) headline = '52-week breakout confirmed';
  else if (brokeLow) headline = 'Key support broken';
  else if (input.eventTitle) headline = 'Event-driven move';
  else if (volumeRatio >= input.volumeThreshold)
    headline = 'Unusual activity building';
  else if (volatilityScore >= 1.5) headline = 'Move is unusual for this stock';
  else if (Math.abs(relativeMove) < 0.005 && Math.abs(returnSinceSeen) > 0.02)
    headline = 'Mostly explained by the market';

  return {
    score,
    priority,
    returnSinceSeen,
    relativeMove,
    volumeRatio,
    volatilityScore,
    components,
    explanations,
    headline,
    expected: Boolean(input.eventTitle),
  };
}
