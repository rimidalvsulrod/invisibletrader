---
name: crypto-strategies
description: Crypto trading strategies and knowledge base - spot, perps, funding, leverage and liquidation math, ten strategy families (trend following, mean reversion, funding-rate farming, arbitrage, liquidation cascades, grid, news momentum, on-chain signals, sentiment, volatility) each with when it works, when it fails, parameters and kill conditions, prediction markets (Polymarket/Kalshi) edge and bankroll, risk management, microstructure, backtesting discipline and failure modes. Use when designing, backtesting, or refining a crypto or prediction-market strategy or bot (e.g. BTC Up or Down), or when explaining those terms.
---

# Crypto Trading Strategies & Knowledge Base

*An educational foundation document for building trading skills and strategy systems with Claude. This is descriptive and educational material — it explains how markets work and how strategies are constructed. It is not financial advice, not a recommendation to trade anything, and contains no promises of profit. Every strategy described here can lose money; many lose money most of the time for most people who try them.*

---

## How to use this document

Each strategy section follows the same anatomy: **how it works** (the mechanics), **when it works best** (the market regime it needs), **when it fails** (the regime that kills it), **key parameters to tune** (the knobs a backtest should explore), and **what would invalidate it** (the evidence that should make you stop trading it). That last part is the most important. A strategy without a kill condition is a hobby, not a system.

The final sections — risk management, microstructure, backtesting discipline, and failure modes — apply to *all* of the above. Read them as the operating system the strategies run on.

---

## 1. Crypto market fundamentals

### The instruments

**Spot.** Buying the actual asset (BTC, ETH, SOL, etc.) on an exchange. You own it (subject to custody — see counterparty risk). No expiry, no leverage by default, no funding payments. The simplest instrument and the baseline everything else is priced against.

**Perpetual futures ("perps").** The dominant crypto derivative. A futures contract with **no expiry date** — you can hold it indefinitely. Because there's no settlement date forcing convergence to spot, perps use a **funding rate mechanism** to tether the contract price to spot:

- Every 8 hours (on most exchanges; some use 1-hour or 4-hour intervals), a funding payment is exchanged between longs and shorts.
- If the perp trades *above* spot (longs are aggressive), funding is positive: longs pay shorts.
- If the perp trades *below* spot (shorts are aggressive), funding is negative: shorts pay longs.
- The payment is proportional to position size. On a large leveraged position held for weeks, funding can quietly eat a meaningful percentage of the account — or, if you're on the receiving side, become the entire point of the trade (see funding-rate farming).

**Dated futures.** Traditional futures with quarterly (or monthly) expiries. The price converges to spot at settlement. The difference between the dated future and spot is the **basis**, which reflects interest-rate differentials and supply/demand. Dated futures are the raw material of cash-and-carry arbitrage.

**Options.** Calls and puts, mostly on Deribit for BTC and ETH (the only crypto options market with serious institutional liquidity). Crypto options behave like equity options with two twists: implied volatility is much higher, and the underlying can move 10%+ in a day, which makes gamma (the rate at which your delta changes) violent. Weekly and even daily expiries exist.

### Leverage and liquidation math

Crypto exchanges offer leverage from 2x up to 100x+ on perps. Leverage multiplies both gains and losses against your margin, and — critically — it introduces **liquidation**: if the market moves against you far enough, the exchange force-closes your position and you lose some or all of the margin.

The rough math: at Lx leverage, a move of approximately (100/L)% against you wipes the position (before maintenance margin buffers and fees). At 10x, ~a 9-10% adverse move liquidates you. At 50x, ~2%. BTC routinely moves 2-5% intraday; alts routinely move 10-20%. This is why high leverage in crypto is less a strategy and more a countdown timer.

Cross margin vs. isolated margin: **isolated** limits the loss to the margin assigned to that position. **Cross** uses the whole account balance as margin, which delays liquidation but means one bad position can drag the entire account down. Beginners should understand both before touching either.

### Why 24/7 changes everything

Crypto never closes. Consequences:

- **No overnight gaps to hide behind, but weekend gaps in attention.** Liquidity thins on weekends and holidays; thinner books mean larger wicks, stop hunts, and liquidation cascades when fewer market makers are active.
- **Funding and news hit at 3 AM.** There is no "after hours." A trader running leveraged positions is exposed around the clock unless stops are in place.
- **Session behavior still exists.** Even in a 24/7 market, volume clusters around the US equity session open, major economic releases, and Asian/European morning flows. Volatility is not uniformly distributed across the day.
- **No circuit breakers.** Equities halt; crypto doesn't. A 20% flash crash resolves in minutes, and your stop fills wherever the book was, not where you placed it.

---

## 2. Core strategy families

### 2.1 Trend following (breakouts, moving-average systems, Donchian channels)

**How it works.** The premise: markets trend often enough that systematically riding moves and cutting losers produces a positive expectancy. Implementations:

- **Breakout:** buy when price closes above the highest high of the last N periods (or breaks a defined range/consolidation); sell/short on the mirror. The Donchian channel (highest high / lowest low over N periods) is the classic formalization.
- **Moving-average systems:** go long when a fast MA crosses above a slow MA (or price crosses above a long MA); exit/reverse on the opposite cross. Variants use MA slope, price position relative to the MA, or multiple-MA stacks.
- **Time-based exits:** trend systems often pair entries with trailing stops (e.g., exit when price closes below the 10-period low) rather than fixed targets, because the logic is "stay in the trend until it ends."

**When it works best.** Sustained directional regimes: crypto bull markets, post-halving expansion phases, strong narrative-driven runs (ETF approvals, major upgrades). Works best on higher timeframes (daily/4H) where trends have room to develop.

**When it fails.** Choppy, range-bound markets — the classic whipsaw. The system buys the top of the range and sells the bottom, repeatedly. Crypto spends most of its time *not* trending; trend followers accept a low win rate (often 30-40%) paid for by large winners.

**Key parameters to tune.** Lookback N (Donchian/breakout length), MA lengths, timeframe, trailing-stop method (ATR-based vs. structure-based), whether to trade both directions or long-only, and — critically — whether to add a regime filter (e.g., only take breakouts when ADX is above a threshold or volatility is expanding).

**What would invalidate it.** A backtest showing the average winner no longer covers the cluster of small losers after fees; win rate collapsing in the recent regime without a compensating increase in average win size; or the system's returns being entirely attributable to one historical episode (e.g., "it only worked in the 2021 bull run").

### 2.2 Mean reversion (Bollinger/RSI-based, statistical)

**How it works.** The premise: price oscillates around a central value, and stretched moves snap back. Implementations:

- **Bollinger Bands:** fade moves that tag or close outside the bands, targeting the middle band (the moving average). Often filtered by band width (only trade when bands are wide = high volatility, avoiding low-volatility chop where tags mean nothing).
- **RSI extremes:** buy when RSI crosses back above an oversold threshold (e.g., 30), sell/short when it crosses back below overbought (e.g., 70). "Crosses back" matters — entering while RSI is still pinned at the extreme is catching a falling knife.
- **Statistical (z-score):** compute the z-score of price (or spread, for pairs) relative to a rolling mean and standard deviation; enter when |z| exceeds a threshold (e.g., 2), exit when it reverts toward 0. This is the formal version of the same idea.

**When it works best.** Range-bound, high-liquidity markets: BTC/ETH chopping sideways, post-impulse consolidation, markets with clear support/resistance. Mean reversion harvests the market's habit of overreacting intraday.

**When it fails.** Trending markets — the deadliest environment. In a strong trend, RSI can stay overbought for weeks and Bollinger tags just mark the beginning of the next leg. Mean-reversion shorts into the 2020-2021 BTC run or longs into the 2022 collapse were account-enders. This is the strategy family most likely to produce a catastrophic single loss, because the natural instinct is to add to a losing mean-reversion position ("it's *more* oversold now").

**Key parameters to tune.** Lookback windows, entry thresholds (how stretched is stretched enough?), exit rules (fixed target vs. reversion-to-mean), maximum holding time (mean reversion decays — a position that hasn't reverted in N periods is probably not reverting), and hard stop-loss placement (non-negotiable for this family).

**What would invalidate it.** A regime shift into trending conditions where the strategy's losers start exceeding its winners; any backtest period where a single trade's loss exceeds the sum of many wins; or the discovery that the edge only existed in one volatility regime.

### 2.3 Funding-rate farming / delta-neutral (long spot + short perp, cash-and-carry)

**How it works.** When perp funding is persistently positive (longs paying shorts), you can collect it without directional exposure: **buy spot, short an equal notional amount of the perp.** Price moves cancel out (delta-neutral); the funding payments accumulate to you. Variants:

- **Cash-and-carry with dated futures:** buy spot, sell the quarterly future when the basis (future − spot) is wide. Lock in the spread at expiry. Same idea, different instrument.
- **Funding-rate harvesting across venues:** the same coin's funding differs by exchange; the trade can be structured where the rate is most favorable.
- **Dynamic version:** only deploy when funding exceeds a threshold (e.g., annualized > 20-30%), unwind when it normalizes.

**When it works best.** Raging bull markets with euphoric long positioning — funding spikes exactly when retail is most levered long. This strategy is essentially a tax on leverage demand.

**When it fails.** Funding can flip negative (then *you're* paying); exchanges can change margin rules; the basis can stay flat for months, leaving capital dead; and "delta-neutral" assumes perfect hedging — during violent moves, spot and perp can briefly diverge, and short-perp positions face liquidation risk if margin isn't managed.

**Key parameters to tune.** Minimum funding threshold for entry, which venues, hedge ratio adjustments, and unwind triggers (funding normalization vs. fixed holding period).

**What would invalidate it.** Sustained negative funding on the target coin; a structural decline in retail leverage demand (funding permanently lower — the "edge" here is behavioral and can decay); or fee/margin changes that push the net yield below your hurdle rate.

### 2.4 Arbitrage (cross-exchange spot, spot-perp basis, triangular)

**How it works.** Exploit price differences for the same (or equivalent) asset:

- **Cross-exchange spot arb:** BTC trades at $X on exchange A and $X+Δ on exchange B; buy A, sell B, capture Δ. Requires capital on both venues and fast transfers (or pre-positioned inventory).
- **Spot-perp basis arb:** a directional variant of cash-and-carry — the "arb" is the funding/basis itself.
- **Triangular arb:** within one exchange, exploit mispricing across three pairs (e.g., BTC/USDT → ETH/BTC → ETH/USDT). Usually tiny and fleeting.

**When it works best.** During volatility spikes and dislocations, when exchanges' books temporarily diverge. Also structurally on less-efficient venues and fiat on-ramps with capital controls.

**When it fails / why it's hard.** This is the most institutional of the families. The honest version:

- **Latency:** you compete with co-located bots. A human or a cron job running every 10 minutes will essentially never win a pure latency arb.
- **Transfer times and fees:** moving crypto between exchanges takes minutes (or longer on congested chains); the arb often closes before your coins arrive. Withdrawal fees eat small edges.
- **Capital requirements:** you need funded accounts on multiple exchanges to avoid transfer latency, which multiplies counterparty risk.
- **Fake volume:** some venues' prices look arbable because the liquidity isn't real.

**Key parameters to tune.** Minimum spread threshold net of all fees (trading fees both sides + withdrawal + transfer), maximum transfer-time tolerance, venue whitelist.

**What would invalidate it.** Measured round-trip profitability going negative after fees; spreads persisting only on venues where you can't actually execute size.

### 2.5 Liquidation-cascade trading (long squeezes, short squeezes, liquidation heatmaps)

**How it works.** The premise: crypto's extreme leverage creates predictable forced-selling/buying. When price approaches a dense cluster of liquidation levels (visible on liquidation heatmaps — Coinglass and similar publish these), a push into the cluster triggers forced closures, which push price further, triggering more liquidations — a cascade. Two ways to play it:

- **With the cascade:** once a cascade visibly starts (funding flipping hard, open interest collapsing, violent wicks), trade in the direction of the forced flow with a tight invalidation — the move is fast and usually exhausts quickly.
- **Fading the exhaustion:** cascades end in wicks. The counter-trade is to wait for the liquidation flush to complete (signs: funding reset to neutral/negative, OI flushed, violent wick with rapid reclaim) and position for the snapback. This is higher-risk and timing-sensitive.

**When it works best.** High-leverage environments: after long periods of one-sided positioning, before/after major events, weekends with thin liquidity. The best cascades follow complacency — record open interest plus extreme funding in one direction.

**When it fails.** Trying to front-run the cascade ("it *should* squeeze here") instead of reacting to it. Positioning can stay extreme far longer than a fade can survive. Also: heatmaps show *estimated* liquidation levels, not exact ones — they're a guide, not a map.

**Key parameters to tune.** What counts as "extreme" (funding percentiles, OI thresholds), confirmation of cascade start (e.g., a volatility expansion beyond N standard deviations), and — for fades — the reclaim criteria that confirm exhaustion rather than the start of something worse.

**What would invalidate it.** Exchanges reducing max leverage (structurally fewer cascades — this has been happening for years); your entries consistently arriving after the move has already exhausted (latency problem); or win rate on fades collapsing because "exhaustion" keeps extending into trend days.

### 2.6 Grid trading

**How it works.** Place a ladder of buy orders below the current price and sell orders above it, at fixed intervals. As price oscillates, the grid buys low and sells high automatically, harvesting the range. Parameters: upper/lower bounds of the grid, number of levels (grid density), and whether it's a neutral grid (both directions) or directional (biased long/short).

**When it works best.** Clean, sustained ranges with no strong trend — the exact market most discretionary traders find boring. The grid monetizes boredom.

**When it fails.** Trends — the failure mode is mechanical and brutal. In a downtrend, the grid keeps buying all the way down ("catching falling knives on autopilot") and ends fully loaded at the lows with no capital left. In a strong uptrend, it sells the entire position early and watches the rally leave without it. Grid trading converts trend risk into inventory risk.

**Key parameters to tune.** Grid bounds (use volatility-based bounds, not round numbers), level spacing (tighter = more trades but more fee drag), total capital allocation (never the whole account — the grid must survive the bounds being hit), and a trend filter that pauses the grid when a trend is detected.

**What would invalidate it.** The underlying spending more time trending than ranging over your test period; fee drag exceeding gross profit (grids trade *a lot* — count the fees); or repeated instances of the grid hitting its lower bound and sitting on maximum inventory.

### 2.7 Momentum ignition / news-driven trading

**How it works.** Trade the market's reaction to catalysts: exchange listings, ETF decisions, protocol upgrades, regulatory news, hacks, major liquidations. The playbook:

- **Speed matters more than analysis.** The first minutes after news define most of the move. This is why the family is dominated by news-wire services and bots, not humans reading articles.
- **Second-order thinking beats first-order.** "Good news" doesn't always mean up — positioning going into the news determines the reaction. A widely expected listing often sells off ("buy the rumor, sell the news").
- **Post-news drift:** crypto exhibits measurable drift after major news — the initial spike is often followed by continuation over hours as slower participants arrive.

**When it works best.** Genuinely surprising, high-impact news in liquid markets. Scheduled events with binary outcomes (ETF decisions, court rulings) where you can pre-plan scenarios.

**When it fails.** Trading headlines without positioning context; chasing the spike after it's already priced in; fake news and rumor cascades (crypto has a rich tradition of both); and the general problem that by the time a human has read, understood, and clicked, the algos have finished.

**Key parameters to tune.** News source latency tier, minimum surprise threshold (only trade news that deviates from consensus), pre-planned long/short scenarios for scheduled events, and maximum hold time (news edges decay in hours, not days).

**What would invalidate it.** Your average entry consistently arriving after the move's midpoint (you're the exit liquidity); or a stretch where "surprising" news keeps producing counterintuitive reactions because positioning keeps overwhelming the news itself.

### 2.8 On-chain signal strategies

**How it works.** Blockchains are public ledgers — flows that are invisible in equities are observable in crypto. Signal families:

- **Exchange netflows:** large *inflows* to exchanges often precede selling (holders moving coins to sell); sustained *outflows* suggest accumulation into cold storage. The signal is in the extremes and the divergences, not everyday noise.
- **Whale wallet tracking:** monitoring large holders' movements — exchange deposits from whale wallets, movements from dormant wallets, known fund/market-maker wallets. (This is Vlad's InvisibleTrader domain applied to spot crypto.) The edge is informational: seeing accumulation/distribution before it hits the order book.
- **Stablecoin supply:** growing stablecoin market caps (USDT, USDC) proxy for dry powder waiting to deploy; sharp contractions can precede liquidity withdrawal.
- **Valuation multiples:** MVRV (market value vs. realized value — are holders in aggregate profit?), SOPR (are coins moving at a profit or loss — spent output profit ratio), NUPL (net unrealized profit/loss). These are cycle-positioning gauges: extreme MVRV/NUPL readings have historically marked euphoria tops and capitulation bottoms.

**When it works best.** Cycle extremes and major positioning shifts — on-chain data is a slow, structural lens, best for swing/position timeframes (weeks to months), not intraday.

**When it fails.** On-chain signals are slow and often *lagging* narratives rather than leading them; "whale moved coins to exchange" has many innocent explanations (OTC settlement, internal rebalancing, custody changes); valuation multiples can stay extreme for months in both directions; and the data requires careful interpretation — raw metrics without context generate false signals constantly.

**Key parameters to tune.** Threshold percentiles (only act on historical extremes, e.g., top/bottom 5% of the metric's history), confirmation windows (sustained flows vs. single spikes), and the timeframe the signal is allowed to influence (don't day-trade off a monthly metric).

**What would invalidate it.** The metric's historical extremes stopping at marking turning points (regime change in holder composition — e.g., ETF flows structurally altering MVRV baselines); or your whale-tracking alerts consistently arriving after the market has already moved (you're watching, not front-running).

### 2.9 Sentiment & positioning (contrarian)

**How it works.** The premise: when everyone is positioned one way, there's no one left to push price that way — reversals become likely. Gauges:

- **Funding rate extremes:** persistently high positive funding = overcrowded longs (contrarian bearish); deeply negative = overcrowded shorts (contrarian bullish). The signal is in multi-day extremes, not single prints.
- **Long/short ratios:** published by exchanges; same logic — extreme ratios mark crowded trades.
- **Open interest divergences:** price making new highs on *falling* open interest suggests the move lacks new participation (weak hands covering, not fresh buying) — a caution flag. Price rising with rising OI = healthy trend participation.
- **Options skew:** extreme put/call skew readings show where hedgers are paying up — often a fear gauge.

**When it works best.** At sentiment extremes — euphoria tops and panic bottoms. Contrarian positioning is a timing aid for entries/exits, not a standalone system; it answers "is this move crowded?" not "which direction?"

**When it fails.** As a standalone trigger. "Everyone is long" is not a short signal by itself — crowds can stay crowded through entire trends (this is just the funding-farming regime from the other side). Positioning tells you about *fragility*, not direction or timing. Shorting euphoria early is how contrarians blow up.

**Key parameters to tune.** What counts as extreme (use percentiles of the metric's own history, not fixed numbers), minimum duration of the extreme (a one-hour funding spike vs. a two-week regime), and the trigger that converts "crowded" into "act" (usually a price/market-structure confirmation, not the sentiment reading alone).

**What would invalidate it.** Extremes repeatedly resolving by continuation instead of reversal over your sample; or the metric's baseline drifting (e.g., structurally higher funding in a more institutional market) so your "extreme" thresholds no longer mean what they meant.

### 2.10 Volatility strategies (options)

**How it works.** Trade volatility itself rather than direction, usually via Deribit BTC/ETH options:

- **Long volatility (straddles/strangles):** buy a call and a put at/around the same strike. Profits if the underlying moves a lot in *either* direction — enough to cover the premium paid. You're buying realized volatility above what implied volatility priced in.
- **Short volatility (selling premium):** collect premium by selling straddles/strangles or spreads. Profits when realized volatility stays below implied — the steady bleed of time decay (theta) works for you.
- **Gamma regimes:** long-gamma positions (owning options) want movement and hedge by trading *with* the move; short-gamma positions want calm and hedge *against* it. Knowing which side of gamma you're on determines your hedging behavior.

**When it works best.** Long vol: before known volatility events where implied vol hasn't fully priced the move, or when implied vol is historically cheap relative to realized. Short vol: in grinding, low-realized-vol regimes where implied vol stays elevated (the persistent crypto pattern of overpriced options — though "persistent" is not "permanent").

**When it fails.** Long vol: the classic bleed — most days don't move enough, theta eats the position daily, and implied vol crushes after the event ("buy the rumor" applies to vol too). Short vol: the asymmetric nightmare — months of small premium collection wiped out by one volatility explosion. Short volatility has the most negatively-skewed payoff in trading; it requires iron position sizing.

**Key parameters to tune.** Implied-vs-realized vol spread (the actual edge metric — only trade when the spread justifies it), days to expiry (theta decay accelerates near expiry; gamma explodes near expiry), strike selection (ATM for pure vol, OTM for cheaper lottery tickets with worse breakevens), and position sizing (small for short vol — the tail risk demands it).

**What would invalidate it.** The IV/RV spread compressing structurally (more efficient options market = thinner edge); or for short vol, a single tail event exceeding your worst-case model — which should trigger a full reassessment of whether the premium was ever worth the risk.

### 2.11 DCA / systematic accumulation

**How it works.** Buy a fixed dollar amount on a fixed schedule regardless of price. The math: you automatically buy more units when prices are low and fewer when high, lowering your average cost versus a lump sum in a choppy-or-down market. Variants:

- **Value-averaged DCA:** adjust the buy size based on deviation from a target growth path (buy more when below target, less when above).
- **Dip-augmented DCA:** base schedule plus extra buys at defined drawdown thresholds (e.g., double the buy at -20% from highs).
- **Threshold DCA:** only buy when valuation gauges (MVRV, long-term moving averages) are below historical medians — a hybrid of DCA and cycle timing.

**When it works best.** Long-horizon accumulation of assets you intend to hold for years, in volatile markets where timing entries is unreliable. This is the lowest-maintenance "strategy" in the document and the only one most people should probably use.

**When it fails.** It doesn't "fail" mechanically, but it underperforms lump-sum investing in steadily rising markets (you're buying higher on average), and it offers no protection in a prolonged bear market — DCA into a multi-year decline just averages down into losses. It also requires the underlying to eventually recover, which is an assumption, not a law.

**Key parameters to tune.** Frequency (weekly vs. monthly — mostly a psychological choice), size per buy, the asset selection itself (DCA works on BTC/ETH's historical recovery pattern; it is not a magic trick for any altcoin), and the exit/rebalancing plan (accumulation without a distribution plan is half a strategy).

**What would invalidate it.** For a given asset: the thesis that it recovers from drawdowns breaking down (the asset enters permanent decline — common for altcoins, which is why DCA is usually discussed for BTC/ETH, not the long tail).

---

## 3. Prediction markets (Polymarket / Kalshi)

This deserves its own section because it is structurally different from everything above — and it is Vlad's actual trading domain.

### How probability pricing works

A prediction market contract pays $1 if the event happens, $0 if it doesn't. Its price *is* the market's estimated probability: a contract trading at 63¢ implies a 63% chance. Prices move as information arrives and as participants' beliefs change.

This creates a fundamentally different game from crypto perps:

- **Bounded outcomes.** Every contract resolves to $1 or $0. There is no liquidation cascade, no funding bleed, no 24/7 margin anxiety in the same form. Your max loss on a buy is the price you paid.
- **Time decay is real but legible.** As resolution approaches, prices converge toward the outcome. Holding a 70¢ "yes" into a likely resolution is a different risk than holding it with months of uncertainty left.
- **No leverage by default.** Position size *is* the risk control. You cannot be liquidated; you can only lose what you put in.

### Where edge comes from

**Information asymmetry.** The durable edge: knowing something the market doesn't, or processing public information faster/better. Examples: reading primary sources (court filings, official announcements) before the market digests them; understanding resolution criteria better than the crowd (many Polymarket losses come from misreading *how* a market resolves, not *what* happens); domain expertise in niche markets (elections procedures, sports rules, regulatory processes).

**Mispricing vs. momentum.** Two distinct play styles:

- *Mispricing:* you believe the true probability differs from the market price. Buy at 40¢ what you estimate is really 65%. This is value investing applied to probabilities. It requires a genuine estimation method — gut feel is not a method.
- *Momentum:* trade the direction of price movement as information arrives, without needing a "true" probability estimate. Faster, more trading-intensive, closer to crypto momentum trading.

**Whale tracking (Vlad's InvisibleTrader domain).** Copying or front-running informed wallets: if a wallet with a strong track record accumulates a position, that *is* information. Caveats that must be respected: you see the wallet's trades, not its reasoning or its full book — it may be hedging elsewhere; by the time you see and copy, the price has often moved; and past wallet performance doesn't guarantee the next trade is informed rather than lucky. Track records need large samples before they mean anything.

### Bankroll considerations (distinct from leveraged crypto)

- **No liquidation means position sizing is simpler but still critical.** The Kelly criterion (see Risk Management) applies cleanly here since outcomes are binary and probabilities are explicit — but full Kelly is aggressive; fractional Kelly (1/4 to 1/2) is the sane version.
- **Correlation across markets is the hidden killer.** Ten "independent" 60% bets on the same election outcome are one bet. Prediction market portfolios concentrate around themes (elections, Fed decisions, crypto prices) — size the *theme*, not the individual market.
- **Resolution risk is its own category.** Markets can resolve ambiguously, be disputed, or resolve on technicalities. Never size a position as if "the obvious outcome" and "the resolving outcome" are the same thing — read the resolution criteria every time.
- **Liquidity varies wildly.** Major election markets are deep; niche markets have wide spreads and thin books. Your edge must exceed the spread plus the time cost of getting filled.

### What would invalidate a prediction-market approach

A tracked record (paper or small-size) showing negative expectancy over a meaningful sample (hundreds of resolved markets, not dozens); or the discovery that your "edge" was really one regime (e.g., it only worked during the election cycle's high-liquidity period).

### Practical playbook notes

- **Read resolution criteria before price.** The most common beginner loss isn't a wrong prediction — it's a right prediction on a market that resolves on a technicality you didn't read. The criteria are the contract; the headline is marketing.
- **Mind the spread.** In thin markets, the bid-ask spread can be 5-10¢. Your edge must clear the spread *twice* (entry and exit) to be real. Deep markets (presidential elections, Fed decisions) are where size belongs; thin markets are for small informational edges only.
- **Time your exits.** A contract bought at 40¢ that's now 75¢ with the event still uncertain has banked most of its edge — consider whether holding for the last 25¢ of convergence is worth the resolution risk. Many prediction-market traders make most of their money on the *move*, not the resolution.
- **Track everything per-market.** Log: your estimated probability at entry, the market price, your reasoning in one sentence, and the outcome. Over hundreds of markets this reveals calibration — e.g., "when I estimate 70%, the event happens 55% of the time" means you're overconfident and should shade every estimate down. Calibration tracking is the prediction-market equivalent of a trading journal, and it's where the real edge compounds.
- **Beware correlated parlays of attention.** During big events (elections, major sports), dozens of related markets move together. Treat the *theme* as one position for sizing purposes, as noted above — ten markets on the same election are not diversification.

---

## 4. Risk management

This section is the difference between a trader and a gambler. Every strategy above assumes these are in place.

### Position sizing

**Fixed fractional.** Risk a fixed percentage of the account per trade (common: 1-2%). A 2% risk means 50 consecutive losers to blow up — the math of survival. Position size derives from the stop distance: `size = (account × risk%) / (entry − stop)`. Wide stop = small size. This single formula prevents most blowups.

**Kelly criterion (and why to be careful).** Kelly computes the theoretically optimal bet size given your win probability (p) and win/loss ratio: `f = p − (1−p)/b`, where b is the odds. In prediction markets with explicit probabilities, it's directly applicable. The dangers: Kelly assumes you *know* your true edge — overestimate p slightly and Kelly tells you to bet far too much; it also assumes many repeated bets and tolerates terrifying drawdowns (full Kelly can suggest 50%+ drawdowns as "optimal"). Practical rule: if you use Kelly, use **fractional Kelly** (quarter or half), and never let it override the fixed-fractional cap.

**Worked example (tying it together).** Account: $1,000. You spot a BTC perp long setup, entry $100,000, invalidation (stop) at $98,500 — a $1,500 stop distance. Fixed-fractional risk of 2% = $20 max loss. Position size = $20 / $1,500 = 0.0133 BTC notional (~$1,333). That's it — the leverage question answers itself: at 10x, the margin needed is ~$133; at 3x, ~$444. The *risk* is identical ($20); leverage only changes how much margin is tied up. If the stop distance were wider ($3,000), the size halves. This is why "what leverage should I use" is the wrong question — "how many dollars do I lose if I'm wrong" is the right one.

### Leverage as magnifier, not strategy

Leverage doesn't create edge — it multiplies whatever edge (or lack of edge) exists, and adds liquidation risk on top. The correct mental model: decide the *position's risk in dollars* first (via fixed fractional), then use whatever leverage is needed to express it — often that means low leverage or none. Anyone choosing leverage first and sizing second has it backwards.

### Stop-loss placement logic

Stops should live where the trade thesis breaks, not at arbitrary percentages:

- **Structure-based:** beyond the swing/level whose breach invalidates the setup.
- **Volatility-based:** a multiple of ATR — gives the trade room to breathe proportional to how much the asset normally moves.
- **Time-based:** if the expected move hasn't started within N periods, exit — a stagnant trade is tying up capital and usually means the read was wrong.

What doesn't work: stops placed at round numbers everyone else uses (stop-hunt magnets), and mental stops you don't honor (a stop you move is not a stop).

### Portfolio heat and correlation

**Portfolio heat:** the total risk across all open positions if every stop is hit simultaneously. Keep it bounded (a common ceiling: 6-10% of the account). Ten positions each risking 2% is not "diversified" — it's 20% heat.

**Correlation risk in crypto.** In stress, crypto correlations go to 1 — BTC, ETH, and alts all fall together. A portfolio of five different altcoin longs is one BTC-beta bet wearing a costume. Diversification in crypto means across *strategies and timeframes* (and into non-crypto), not across tickers. Size assuming your positions will all lose together, because in a crash they will.

### Drawdown rules and daily loss limits

- **Max drawdown rule:** define in advance the account drawdown that triggers a full stop and review (e.g., 15-20%). When hit: stop trading, review every recent trade, and only resume with reduced size. This is the circuit breaker for the trader, since crypto has none for the market.
- **Daily loss limit:** a smaller-scale version (e.g., 3-5% of the account per day). Hit it and you're done for the day — no exceptions. Most catastrophic single-day losses in retail trading history share one trait: the trader kept going after the limit.

---

## 5. Market microstructure for crypto

### Reading the order book (and its limits)

The book shows resting limit orders — bids below, asks above. Useful reads: **bid/ask imbalance** near the touch (short-term pressure), **spoofing/layering** (large orders that appear and vanish — intent to mislead, common in crypto), **absorption** (large market orders getting filled without price moving — someone big defending a level), and **book depth vs. actual liquidity** (displayed size evaporates when tested).

The limit: the book only shows *resting* intentions, not the hidden iceberg orders or the market orders about to arrive. Book-reading is a short-horizon skill (seconds to minutes); it degrades fast beyond that.

### Slippage and market impact on alts

On BTC/ETH, a retail-size market order barely moves the price. On a low-liquidity alt, the same order can move it several percent — you become the price action. Rules: use limit orders on alts, check the book depth relative to your size before entering (if your order exceeds ~1-5% of visible depth, expect impact), and assume your backtest fills were better than reality unless slippage was modeled.

### Execution: market vs. limit vs. TWAP

- **Market orders:** certainty of fill, uncertainty of price. Fine for liquid majors in a hurry; dangerous on alts and during volatility.
- **Limit orders:** certainty of price, uncertainty of fill. The default for entries — but a limit that never fills while the trade runs without you is its own cost.
- **TWAP (time-weighted average price):** split a large order into small pieces executed over time. The standard for building size without signaling. Any bot handling real size needs execution logic, not just signal logic.

### Exchange differences

Not all venues are equal: **fees** (maker/taker schedules vary widely and determine whether high-frequency strategies survive), **liquidity quality** (some exchanges' volume is substantially wash/fake — compare against independent estimators), **reliability** (downtime clusters exactly during the volatility you most need to trade — track record matters), **margin and liquidation engines** (how liquidations are executed affects your tail risk), and **jurisdiction** (which regulator, if any, stands behind the venue).

### Counterparty risk — the FTX lesson

If your coins are on an exchange, they are the exchange's liabilities, not your property. FTX's collapse demonstrated that even the largest, most reputable-seeming venues can fail, and customer funds can be impaired or frozen for years. Practical criteria for venue selection: proof of reserves (imperfect but better than nothing), regulatory standing, longevity through at least one full bear market, withdrawal reliability (test small withdrawals regularly), and position limits per venue — never keep more on any single exchange than you can afford to have frozen. Self-custody (hardware wallet) for holdings you don't need on-exchange is the baseline, not paranoia.

---

## 6. Backtesting & validation discipline

A strategy is a hypothesis. This is the lab protocol for testing it — and most strategies die here, which is the point.

### What to demand before trusting any strategy

1. **Out-of-sample testing.** Optimize parameters on one period, then test on a *different, untouched* period. If performance collapses out-of-sample, you curve-fit. The out-of-sample set must never influence parameter choices — not even "let me just check."
2. **Walk-forward analysis.** Roll the optimization window forward through time (optimize on 2021-2022, test 2023; optimize on 2022-2023, test 2024...). A strategy that only works with one fixed parameter set is fragile; one that works across rolling windows is robust.
3. **Full cost accounting.** Fees (taker fees on every fill — be pessimistic), funding payments for perps held across funding intervals, and slippage (model it as a fixed penalty per trade, scaled to the asset's liquidity). A strategy that's profitable before costs and unprofitable after them was never a strategy.
4. **Minimum trade counts.** Statistical significance needs samples. Rough guidance: dozens of trades minimum for a directional system, hundreds for high-frequency approaches. A 70% win rate over 10 trades means almost nothing; over 500 trades it means something.
5. **Regime coverage.** The backtest must include bull, bear, *and* chop. A strategy tested only on 2021's bull market has been tested on one regime. Crypto's regimes are violent and distinct — this requirement is non-negotiable.
6. **The invalidation-first mindset ("try to kill it first").** Before asking "does this work?", ask "what would prove it doesn't?" Define the kill conditions *before* testing: max acceptable drawdown, minimum out-of-sample profit factor, the market condition under which you'd shut it off. Then try to break it — stress the parameters, add costs, shorten the sample. Strategies that survive attempted murder deserve attention; the rest were never alive.

### Overfitting red flags

- Many parameters tuned to precise values ("it only works with a 17-period MA and a 2.3 ATR stop").
- Performance concentrated in a handful of trades (remove the top 5 trades and the edge vanishes).
- Equity curve that's suspiciously smooth (real strategies have drawdowns; a perfect curve usually means lookahead bias — accidentally using future information).
- The strategy "needs" one specific historical event to be profitable.
- Parameter sensitivity: tiny parameter changes flip the result from profit to loss (a robust edge has a plateau of working parameters, not a needle).

### Paper trading as the final gate

After backtesting comes forward-testing with fake money on live data — the strategy runs in real time, with real spreads and real timing, but no capital at risk. Paper trading catches what backtests can't: execution realities, the psychological effect of watching it live, data-feed quirks, and whether *you* can actually operate the system. Only after a paper period (weeks minimum, covering varied conditions) does real capital enter — and then at reduced size.

### Minimum viable backtest checklist

Before showing any strategy result to anyone (including yourself, optimistically), confirm each of these:

- [ ] Out-of-sample period exists and was never used for tuning
- [ ] Fees modeled pessimistically (taker fees on every fill)
- [ ] Funding payments included for any perp held across funding intervals
- [ ] Slippage penalty applied per trade (scaled to the asset's liquidity)
- [ ] Trade count meets the minimum for the strategy's frequency
- [ ] Test covers bull, bear, AND chop regimes
- [ ] Kill conditions defined in advance (max drawdown, min profit factor out-of-sample)
- [ ] Top-5-trades removal test: edge survives without the best trades
- [ ] Parameter sensitivity check: small tweaks don't flip profit to loss

---

## 7. Common failure modes

The strategies fail for technical reasons; traders fail for human ones. The human list is shorter and more lethal:

- **Overleveraging.** The #1 retail account killer, by a wide margin. Leverage converts normal volatility into liquidation events. If you're thinking about 20x, re-read the liquidation math in Section 1.
- **Revenge trading.** Taking impulsive trades immediately after a loss to "win it back." The market doesn't know you lost and doesn't owe you anything. The daily loss limit exists for exactly this moment.
- **Strategy-hopping.** Abandoning a system during its normal drawdown to chase whatever worked last month. Every strategy has losing periods; hopping guarantees you experience everyone's drawdowns and no one's recoveries.
- **Confusing a bull market for skill.** In a strong uptrend, almost everything works — including no strategy at all. The test of a trader is what happens in chop and bear markets. If your results can't be distinguished from "bought and held BTC," you don't have a strategy yet.
- **Ignoring funding costs on long-held perps.** A leveraged long held for months in a high-funding environment can lose more to funding than to price. Funding is a slow bleed that doesn't show up on the price chart.
- **API/key security.** Trading bots need API keys. Keys with withdrawal permissions are a catastrophic risk — always restrict to trading-only, IP-whitelist where possible, and never commit keys to code repositories or chat logs. More than one trader's account has been drained through a leaked key.
- **Ignoring taxes and record-keeping.** Every trade is a taxable event in most jurisdictions. Track everything from day one; reconstructing a year's worth of perp trades at tax time is miserable.

---

## Closing note

No document, skill, or AI can hand you a profitable strategy — the work is in the testing, and most ideas won't survive it. That's normal and expected; the validation process in Section 6 is designed to kill bad ideas cheaply (in backtests and paper trading) instead of expensively (in a live account). The traders who last are not the ones with the best indicators — they're the ones with the best kill criteria, the tightest risk controls, and the discipline to stop when the evidence says stop.

**Using this document with Claude:** paste it as context, then ask Claude to do three things in order — (1) steelman a strategy from one of the families above, writing out its exact rules, parameters, and kill conditions; (2) attack it, listing every way it loses money and which regime kills it; (3) design the backtest that would settle the argument, including the data needed, the cost model, and the out-of-sample plan. Only strategies that survive all three steps earn paper-trading time.

*Coverage note: all material above is original educational synthesis of widely-documented public trading concepts. No copyrighted text is reproduced. Market-structure facts (funding mechanics, liquidation math, instrument definitions) reflect standard, non-proprietary exchange mechanics as of 2026.*
