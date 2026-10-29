export type MaterialQuote={id:string;category:string;product:string;supplier:string;unit:string;price_usd:string;coverage_ft2:string|null;source_url:string;coverage_source_url:string|null;availability:string};
export type PriceResearch={id:string;status:'running'|'completed'|'failed'|'unknown';request:{query:string;location:string};model:string;started_at:string;checked_at?:string;quotes:MaterialQuote[];notes:string[];message?:string};
export type PricingBasis={research_id:string;quote_ids:string[];waste_percent:string;labor_rate_low:string;labor_rate_high:string;reviewed:true};
export type PriceProposal={research_id:string;checked_at:string;model:string;quotes:MaterialQuote[];material_rate_ft2:string;rate_low:string;rate_high:string;basis:PricingBasis;exclusions:string[]};
