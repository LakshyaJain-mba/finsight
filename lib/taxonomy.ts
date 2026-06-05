// Metric Taxonomy — implementation of Spec v1.0 §1 (FROZEN).
// Do not redesign metric definitions or polarity here; this is a faithful
// encoding of the specification.
import type { MetricConfig, Polarity, ResolutionMethod } from '@/types';

export const METRIC_TAXONOMY: MetricConfig[] = [
  // §1.1 Growth & Revenue
  { key: 'REVENUE_GROWTH', aliases: ['topline growth', 'sales growth', 'net sales growth', 'revenue cagr', 'revenue growth', 'topline'], unit: '% YoY', polarity: 'HIGHER_BETTER', resolution_method: 'RM-DELTA-YOY', confidence_notes: 'Consolidated vs standalone; organic vs inorganic' },
  { key: 'REVENUE_ABS', aliases: ['revenue', 'net sales', 'turnover', 'total income', 'topline'], unit: '₹ cr', polarity: 'HIGHER_BETTER', resolution_method: 'RM-ABS', confidence_notes: 'Segment vs total' },
  { key: 'VOLUME_GROWTH', aliases: ['volume', 'volumes', 'tonnage', 'dispatches', 'units sold', 'volume growth'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-DELTA-YOY', confidence_notes: 'Unit definition (MT vs units vs cases)' },
  { key: 'REALIZATION', aliases: ['asp', 'average realisation', 'average realization', 'nsr', 'realisation', 'realization', 'arpu'], unit: '₹/unit', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', confidence_notes: 'Mix effect; gross vs net realisation' },
  { key: 'ORDER_INFLOW', aliases: ['order intake', 'order book', 'backlog', 'order inflow', 'order inflows', 'l1'], unit: '₹ cr', polarity: 'HIGHER_BETTER', resolution_method: 'RM-ABS', confidence_notes: 'Inflow (period) vs book (stock)' },
  { key: 'SSSG', aliases: ['lfl growth', 'like-for-like', 'like for like', 'same-store', 'same store sales', 'sssg'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-DELTA-YOY', sector: 'Retail/QSR', confidence_notes: 'Store maturity; definition window' },
  { key: 'AUM_GROWTH', aliases: ['assets under management', 'aum', 'aum growth'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-DELTA-YOY', sector: 'AMC/NBFC', confidence_notes: 'On-book vs off-book/AUM; co-lending' },
  { key: 'DISBURSEMENTS', aliases: ['loan disbursals', 'disbursement', 'disbursements', 'disbursement growth'], unit: '₹ cr', polarity: 'HIGHER_BETTER', resolution_method: 'RM-ABS', sector: 'NBFC/HFC', confidence_notes: 'Sanctions vs disbursals' },

  // §1.2 Profitability & Margins
  { key: 'GROSS_MARGIN', aliases: ['gm', 'gross margin'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', confidence_notes: 'RM definition (RM/sales) varies' },
  { key: 'EBITDA_MARGIN', aliases: ['opm', 'operating margin', 'ebitda margin', 'margin'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', confidence_notes: 'Reported vs adjusted EBITDA; ±50 bps tolerance' },
  { key: 'EBITDA_ABS', aliases: ['operating profit', 'ebitda'], unit: '₹ cr', polarity: 'HIGHER_BETTER', resolution_method: 'RM-ABS', confidence_notes: 'One-offs/exceptionals' },
  { key: 'PAT_MARGIN', aliases: ['net margin', 'npm', 'pat margin', 'net profit margin'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', confidence_notes: 'Pre/post minority & exceptional' },
  { key: 'PAT_ABS', aliases: ['net profit', 'pat', 'bottomline', 'bottom line', 'profit after tax'], unit: '₹ cr', polarity: 'HIGHER_BETTER', resolution_method: 'RM-ABS', confidence_notes: 'Adjusted vs reported; tax one-offs' },
  { key: 'EPS', aliases: ['earnings per share', 'eps'], unit: '₹', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', confidence_notes: 'Diluted vs basic; bonus/split adjust' },
  { key: 'NIM', aliases: ['net interest margin', 'nim'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Bank/NBFC', confidence_notes: 'Reported methodology; quarterly volatility' },
  { key: 'ROE', aliases: ['return on equity', 'roe', 'ronw'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-RATIO', confidence_notes: 'Avg vs period-end equity' },
  { key: 'ROCE', aliases: ['return on capital employed', 'roce'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-RATIO', confidence_notes: 'Capital base definition' },
  { key: 'ROA', aliases: ['return on assets', 'roa', 'rota'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-RATIO', sector: 'Bank/NBFC', confidence_notes: 'Avg vs period-end assets' },

  // §1.3 Cost & Efficiency
  { key: 'COST_TO_INCOME', aliases: ['c/i ratio', 'cost-income', 'cost to income', 'cost income ratio'], unit: '%', polarity: 'LOWER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Bank/NBFC', confidence_notes: 'Opex scope' },
  { key: 'CREDIT_COST', aliases: ['credit cost', 'provisions to advances', 'loan loss', 'credit costs'], unit: '%', polarity: 'LOWER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Bank/NBFC', confidence_notes: 'Annualised vs period; one-offs' },
  { key: 'EFFECTIVE_TAX_RATE', aliases: ['etr', 'tax rate', 'effective tax rate'], unit: '%', polarity: 'TARGET_ATTAINMENT', resolution_method: 'RM-PLAN-ATTAIN', confidence_notes: 'New vs old tax regime; deferred tax' },

  // §1.4 Balance Sheet, Leverage & Asset Quality
  { key: 'NET_DEBT', aliases: ['net debt', 'net borrowings'], unit: '₹ cr', polarity: 'LOWER_BETTER', resolution_method: 'RM-ABS', confidence_notes: 'Lease liabilities (Ind-AS 116) inclusion' },
  { key: 'NET_DEBT_TO_EBITDA', aliases: ['leverage', 'net debt to ebitda', 'net debt/ebitda'], unit: 'x', polarity: 'LOWER_BETTER', resolution_method: 'RM-RATIO', confidence_notes: 'TTM vs current EBITDA' },
  { key: 'DEBT_TO_EQUITY', aliases: ['gearing', 'd/e', 'debt to equity', 'debt-equity'], unit: 'x', polarity: 'LOWER_BETTER', resolution_method: 'RM-RATIO', confidence_notes: 'Off-BS items' },
  { key: 'WORKING_CAPITAL_DAYS', aliases: ['nwc days', 'working capital days', 'cash conversion cycle'], unit: 'days', polarity: 'LOWER_BETTER', resolution_method: 'RM-RATIO', confidence_notes: 'Component definitions' },
  { key: 'CAPEX', aliases: ['capex', 'capital expenditure'], unit: '₹ cr', polarity: 'TARGET_ATTAINMENT', resolution_method: 'RM-PLAN-ATTAIN', confidence_notes: 'Commitment vs cash capex; multi-year phasing' },
  { key: 'GROSS_NPA', aliases: ['gnpa', 'gross npa'], unit: '%', polarity: 'LOWER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Bank/NBFC', confidence_notes: 'RBI norms; write-off effect' },
  { key: 'NET_NPA', aliases: ['nnpa', 'net npa'], unit: '%', polarity: 'LOWER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Bank/NBFC', confidence_notes: 'PCR linkage' },
  { key: 'PCR', aliases: ['provision coverage ratio', 'pcr'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Bank/NBFC', confidence_notes: 'With/without tech write-off' },
  { key: 'CRAR', aliases: ['car', 'crar', 'capital adequacy'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Bank/NBFC', confidence_notes: 'Tier-1 vs total' },

  // §1.5 Cash Flow & Capacity/Operations
  { key: 'OCF', aliases: ['operating cash flow', 'cfo', 'ocf'], unit: '₹ cr', polarity: 'HIGHER_BETTER', resolution_method: 'RM-ABS', confidence_notes: 'Pre/post working capital' },
  { key: 'FCF', aliases: ['free cash flow', 'fcf'], unit: '₹ cr', polarity: 'HIGHER_BETTER', resolution_method: 'RM-ABS', confidence_notes: 'Capex definition dependency' },
  { key: 'DIVIDEND_PAYOUT', aliases: ['payout ratio', 'dividend', 'dividend payout'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', confidence_notes: 'Special vs regular' },
  { key: 'CAPACITY_ADD', aliases: ['capacity addition', 'capacity expansion', 'expansion', 'capacity add'], unit: 'units', polarity: 'TARGET_ATTAINMENT', resolution_method: 'RM-PLAN-ATTAIN', sector: 'Mfg/Cement/Power', confidence_notes: 'Commissioning slippage; nameplate vs effective' },
  { key: 'CAPACITY_UTILIZATION', aliases: ['utilisation', 'utilization', 'cu', 'capacity utilization'], unit: '%', polarity: 'HIGHER_BETTER', resolution_method: 'RM-LEVEL', sector: 'Mfg', confidence_notes: 'Seasonal' },
  { key: 'STORE_COUNT', aliases: ['store additions', 'store count', 'network', 'store adds'], unit: 'count', polarity: 'TARGET_ATTAINMENT', resolution_method: 'RM-PLAN-ATTAIN', sector: 'Retail/QSR', confidence_notes: 'Gross adds vs net of closures' },
];

const UNCLASSIFIED: { metric_key: string; polarity: Polarity | null; resolution_method: ResolutionMethod; confidence_m: number } = {
  metric_key: 'OTHER',
  polarity: null,
  resolution_method: 'RM-NARRATIVE',
  confidence_m: 0.3,
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pre-build a normalized alias → config index.
const ALIAS_INDEX: { needle: string; config: MetricConfig }[] = [];
for (const config of METRIC_TAXONOMY) {
  ALIAS_INDEX.push({ needle: normalize(config.key.replace(/_/g, ' ')), config });
  for (const alias of config.aliases) {
    ALIAS_INDEX.push({ needle: normalize(alias), config });
  }
}
// Longer needles first so specific phrases win over generic substrings.
ALIAS_INDEX.sort((a, b) => b.needle.length - a.needle.length);

export function getMetricConfig(metricKey: string): MetricConfig | undefined {
  return METRIC_TAXONOMY.find((m) => m.key === metricKey);
}

export interface CanonicalizeResult {
  metric_key: string;
  polarity: Polarity | null;
  resolution_method: ResolutionMethod;
  confidence_m: number;
}

/**
 * Map free-text metric/statement text to a canonical metric key.
 * Exact alias match → confidence 1.0; fuzzy (contained phrase) → 0.7;
 * no match → UNCLASSIFIED (OTHER) → 0.3. (Spec v1.0 §5.2)
 */
export function canonicalizeMetric(raw: string): CanonicalizeResult {
  const text = normalize(raw ?? '');
  if (!text) return { ...UNCLASSIFIED };

  // Exact: the text equals an alias/key.
  for (const { needle, config } of ALIAS_INDEX) {
    if (needle && text === needle) {
      return {
        metric_key: config.key,
        polarity: config.polarity,
        resolution_method: config.resolution_method,
        confidence_m: 1.0,
      };
    }
  }

  // Fuzzy: an alias phrase is contained within the text (word-boundary-ish).
  for (const { needle, config } of ALIAS_INDEX) {
    if (needle && needle.length >= 3 && text.includes(needle)) {
      return {
        metric_key: config.key,
        polarity: config.polarity,
        resolution_method: config.resolution_method,
        confidence_m: 0.7,
      };
    }
  }

  return { ...UNCLASSIFIED };
}

export interface Tolerance {
  kind: 'bps' | 'growth' | 'abs_rel' | 'mult' | 'plan_rel' | 'days_rel' | 'none';
  value: number;
}

/**
 * Default tolerance bands by metric class (Spec v1.0 §2). Used by the
 * resolution engine (M3); defined here so taxonomy stays the single source.
 */
export function toleranceFor(metricKey: string): Tolerance {
  const cfg = getMetricConfig(metricKey);
  if (!cfg) return { kind: 'none', value: 0 };
  if (cfg.polarity === 'TARGET_ATTAINMENT') return { kind: 'plan_rel', value: 0.1 };
  switch (cfg.unit) {
    case '% YoY':
      return { kind: 'growth', value: 1.0 }; // ±100 bps OR ±10% rel (tighter)
    case '%':
      return { kind: 'bps', value: 0.5 }; // ±50 bps on a level metric
    case 'x':
      return { kind: 'mult', value: 0.1 };
    case '₹ cr':
    case '₹':
    case '₹/unit':
      return { kind: 'abs_rel', value: 0.03 };
    case 'days':
      return { kind: 'days_rel', value: 0.05 };
    default:
      return { kind: 'abs_rel', value: 0.05 };
  }
}
