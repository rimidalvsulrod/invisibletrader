---
name: ict-concepts
description: Inner Circle Trader (ICT) market concepts as a structured knowledge base - liquidity, fair value gaps, power of three (AMD), market maker models, market structure, order blocks, SMT divergence, standard deviation projections, killzones, and futures fundamentals - plus how they combine into a written, testable trading model. Use when designing, backtesting, or refining a strategy or bot from ICT / smart money ideas, or when explaining those terms.
---

# ICT Trading Concepts — Educational Foundation

> **Purpose of this document:** This is a structured knowledge base of Inner Circle Trader (ICT)–style market concepts, compiled from a 12-video educational curriculum. It is written so an AI assistant (Claude) can ingest it as a skill and help design, backtest, and refine trading strategies from these ideas.
>
> **How the concepts fit together:** ICT-style trading rests on one core premise — price moves to seek *liquidity* (pools of resting orders, especially stop losses) and to rebalance *inefficiency* (imbalances left by aggressive moves). Everything else in this document is a lens for reading where liquidity rests, when it is likely to be taken, and how to position around that event. The concepts layer like this:
>
> 1. **Market Structure** tells you the prevailing direction (the bias).
> 2. **Liquidity** tells you where price is drawn (the target).
> 3. **Killzones / time** tell you *when* the move is likely to happen.
> 4. **PO3 (AMD), MMXM, Order Blocks, FVGs, SMT, Standard Deviations** give you the entry models and measurement tools once bias, target, and timing align.
>
> **Disclaimer:** This is educational material describing how some traders analyze markets. It is not financial advice, not a recommendation to trade, and contains no promise of profitability. Every concept here must be forward-tested and validated by the individual trader; many traders lose money using these ideas incorrectly.

---

## 1. LIQUIDITY

### What it is (precise definition)
Liquidity, in ICT terms, is a concentration of resting orders — above all, the stop-loss orders of retail traders — sitting at predictable locations on the chart. Institutions need large counterparties to fill big positions without slippage, so price is "attracted" to levels where many stops rest, because triggering those stops releases a flood of market orders (liquidity) the larger players can trade against. The working mantra: **price moves from liquidity to liquidity**, and old highs/lows are magnets because stops cluster just beyond them.

### The mechanics (how/why it works)
- When institutions accumulate or distribute at a level (e.g., a demand zone), retail traders often piggyback the same trade idea. Their protective stops then rest at the nearest swing highs/lows.
- Those stops are visible in aggregate behavior: equal highs, equal lows, trendlines, and prior session highs/lows all mark where stops concentrate.
- When price runs through such a level, the triggered stops become market orders in the opposite direction — sell stops below lows become sell orders that a large buyer absorbs to fill a long position (and vice versa). The "sweep" of the level is therefore not the breakout retail thinks it is; it is the *purpose* of the move.
- After liquidity is taken ("absorbed"), the level often flips function: what was resistance becomes a magnet already spent, and price is free to continue or reverse.

### Types of liquidity (from the curriculum)
1. **Support / resistance liquidity** — resting above/below established swing highs and lows.
2. **Equal highs / equal lows (EQH/EQL)** — two or more highs/lows at nearly the same price. The more touches, the more stops accumulate, and the stronger the magnet.
3. **Trendline liquidity** — stops resting beneath rising trendlines or above falling ones; retail trendline traders place stops just beyond the line, creating a clean pool.
4. **Failed-to-break (FTB) liquidity** — price pushes into a level but cannot close through it; the level has absorbed the available opposing orders, signaling the opposing side is exhausted and continuation the other way is likely.
5. **Failed-to-close (FTC) liquidity** — a candle wicks through a level but never *closes* beyond it; the wick-through level becomes a magnet for a later visit.
6. **Internal vs. external liquidity** — *internal* liquidity lives inside a dealing range (minor swing points); *external* liquidity sits at the range boundaries (the range high/low, old highs/lows). ICT traders generally expect price to take internal liquidity first, then drive to external liquidity.

### The stop hunt / "turtle soup" and inducement
- **Stop hunt (turtle soup):** price briefly spikes beyond a swing high/low, triggering the stops resting there, then reverses hard. The breakout traders who entered on the "break" are now trapped, and their own stops fuel the reversal. Entries are taken on the reversal, with the stop beyond the swept extreme.
- **Inducement:** price approaches a trader's point of interest but deliberately falls short, printing a small reaction that entices early entries (or makes traders abandon their level, believing price "won't reach it"). Price then runs the *real* liquidity objective and only afterward returns to the original point of interest. The lesson: don't chase the first reaction; wait for the liquidity sweep.

### How traders apply it
- **Targets:** resting liquidity (EQH/EQL, session highs/lows, old highs/lows) is used as the profit objective — the "draw on liquidity."
- **Entries:** after a sweep of liquidity (stop hunt), traders look for reversal confirmation (a market structure shift or displacement back through the level) and enter with the stop beyond the sweep extreme.
- **Invalidation:** if price sweeps a level and then closes back *through* it with displacement instead of reversing, the sweep thesis weakens.

### Common mistakes
- Treating every wick beyond a high as a tradable sweep (context — higher-timeframe bias and timing — decides whether a sweep is meaningful).
- Entering *before* the sweep ("front-running" the level) instead of after it.
- Confusing internal-range noise with genuine external liquidity raids.

### Connections
- Liquidity is the "why" behind **PO3's manipulation leg**, the target of **MMXM buy/sell programs**, what **FVGs** get drawn toward ("draw on liquidity"), and what **killzones** time.

---

## 2. FAIR VALUE GAPS (FVGs)

### What it is (precise definition)
A fair value gap is a three-candle price imbalance: in a **bullish FVG**, the high of candle 1 does not overlap the low of candle 3, leaving a visible "gap" between them that the middle (displacement) candle created. In a **bearish FVG**, the low of candle 1 does not overlap the high of candle 3. The gap marks where price moved so aggressively that it left orders unfilled — an inefficiency the market tends to revisit ("fill") partially or fully before continuing.

### The mechanics (how/why it works)
- Large, energetic displacement candles indicate institutional order flow. The inefficiency they leave acts as a magnet: price is drawn back to rebalance before efficient continuation.
- Traders nickname the two directions **BISI** (Buy-Side Imbalance, Sell-Side Inefficiency — bullish) and **SIBI** (Sell-Side Imbalance, Buy-Side Inefficiency — bearish).
- Not every gap fills completely. The curriculum teaches three reference levels inside a gap:
  1. **IOFED (Institutional Order Flow Entry Drill):** price barely taps into the gap's edge, then expands away. Most common when momentum is heavy and candles are large/energetic.
  2. **Consequent Encroachment (CE):** the midpoint (50%) of the gap. Price often retraces exactly to the middle before reversing — the highest-probability fill level taught in ICT material.
  3. **Full fill:** price trades through the entire gap. After a full fill, either the level holds (long wick rejection → continuation) or it fails completely (the gap is "disrespected" and price continues through).

### How traders apply it
- **Entries:** after a valid setup (e.g., a liquidity sweep + market structure shift), traders place limit entries at a FVG's CE or edge, with stops beyond the gap's far extreme (or beyond the sweep extreme), targeting resting liquidity.
- **Targets:** unfilled FVGs in the direction of the move act as "draws on liquidity" — price objectives.
- **Invalidation:** if price closes *through* the far side of the FVG with displacement (a "disrespected" gap / inversion), the long/short thesis at that gap is void; the inverted gap often becomes support-turned-resistance (or vice versa) — the **inversion FVG (IFVG)** entry model.

### Common mistakes
- Marking every 3-candle non-overlap as tradable; low-momentum, small-range gaps are noise. Displacement (large, energetic candles) is what qualifies a gap.
- Expecting full fills every time; most continuations only reach CE or IOFED.
- Trading FVGs against the higher-timeframe bias.

### Connections
- FVGs are the precision entry tool inside **PO3 distribution legs**, the "inefficiency" that **MMXM** programs target, the refinement of **order block** entries, and what **SMT divergence** is often confirmed against.

---

## 3. POWER OF THREE (PO3) — Accumulation, Manipulation, Distribution (AMD)

### What it is (precise definition)
The Power of Three is ICT's intraday price-delivery template: every trading day (and fractally, every session or swing) tends to trace three phases — **Accumulation** (a range/consolidation that builds stops above its highs and below its lows), **Manipulation** (a false breakout beyond one side of the range that stops out early participants and induces breakout traders the wrong way), and **Distribution** (the real, energetic expansion in the opposite direction that forms the bulk of the day's range). On the daily candle this prints as either an **OHLC** candle (open → high → low → close: manipulation up, distribution down) or **OLHC** (open → low → high → close).

### The mechanics (how/why it works)
- **Accumulation** (often the Asian range overnight) builds buy stops above the range high and sell stops below the range low.
- **Manipulation** (often the London session) spikes beyond one side: it stops out traders positioned during accumulation *and* traps breakout traders who chase the false break. This is the liquidity grab that funds the real move.
- **Distribution** (often the New York session) is the displacement leg — the expansion that creates most of the day's range and forms the body of the daily candle, while the manipulation leg forms its wick.
- The concept is **fractal**: the same AMD pattern appears on the 1-minute chart inside a session, on the 5-minute chart across a morning, and on the daily chart across the week.
- A practical identification tip from the curriculum: if you struggle to find the consolidation, look for the *manipulation* first — the aggressive move out of a range and back in — then work backward to mark the range it came from.

### How traders apply it
- **Two entry styles:** (1) *Reversal entries* inside the manipulation leg — after the sweep, look for reversal patterns (inversion FVGs, "box" setups) to catch the entire distribution; (2) *Continuation entries* inside distribution — join the expansion after it confirms, targeting the projected range.
- **Targets via standard-deviation projection:** measure the manipulation leg (from the low that made the move to the extreme) and project it: the 2.0–2.5 and 4.0–4.5 standard-deviation extensions are taught as distribution objectives, often aligning with resting liquidity (equal lows/highs).
- **Prerequisite:** the curriculum stresses you must have a higher-timeframe bias ("draw on liquidity") first — without a narrative, AMD is just pattern-trading.

### Common mistakes
- Trading every range as accumulation (ranges in the middle of nowhere, with no higher-timeframe objective, are just chop).
- Entering during manipulation *with* the false breakout instead of fading it.
- Missing that a completed AMD on a lower timeframe may just be the manipulation leg of a larger-timeframe AMD.

### Connections
- PO3 is the intraday expression of the **liquidity** cycle, the time-based sister of **MMXM**, measured with **standard deviations**, entered via **FVG/order-block** models, and timed by **killzones**.

---
## 4. MARKET MAKER MODELS (MMXM)

### What it is (precise definition)
Market Maker Models are ICT's algorithmic framing of price delivery: the market is described as running in alternating **buy programs** (instructions driving price higher) and **sell programs** (instructions driving price lower). A **Market Maker Buy Model (MMBM)** prints as: consolidation low in a range → engineered liquidity below → a sharp rally (the buy program) into premium → then a **Market Maker Sell Model (MMSM)** takes over: consolidation high in a range → engineered liquidity above → sharp decline. The "smart money reversal" (SMR) is the pivot point where one program ends and the other begins. Under this lens, price action is read as code executing on two variables — **time and price** — rather than as random buying and selling pressure.

### The mechanics (how/why it works)
- **Dealing ranges and DRT levels:** every range is measured in quartiles. The range high = 0% (premium extreme), range low = 100% (discount extreme), the midpoint = 50% ("equilibrium"), with 25% and 75% levels ("DRT levels") marking the upper and lower quartiles. Price is read as cheap (discount, below equilibrium — where buyers look for longs) or expensive (premium, above equilibrium — where sellers look for shorts).
- **The buy program:** after consolidating in the lower quartile (engineering sell-side liquidity below in the form of relative equal lows), a displacement candle through the consolidation high confirms the buy program; price then "spools" higher toward a pre-determined objective — typically an inefficiency (sell-side imbalance/FVG) sitting in premium, often at a measured standard-deviation extension of the initial consolidation range (2.5 deviations in the curriculum's example).
- **Volume imbalance:** a tiny gap between one candle's close and the next candle's open, nested inside an inefficiency — treated as a high-precision magnet the algorithm must tag.
- **Smart money reversal + CISD:** the pivot is marked by a **change in state of delivery (CISD)** — e.g., price trading through the opening price of the last up-close candle — the signature that ends the buy program and starts the sell program. The curriculum distinguishes a **market structure shift (MSS)** (a break that continues the higher-timeframe trend) from a **break of structure (BOS)**.
- **Inversion FVGs and breakers:** when price displaces back through a prior bullish FVG, it becomes an *inversion* FVG (bearish) — a high-probability short zone. A **breaker** is a failed support/resistance level (e.g., a bullish order block that price breaks through) that flips polarity and acts as resistance.
- **Measuring vs. breakaway gaps:** a **measuring gap** (FVG through range equilibrium) lets the trader project how much range remains to be delivered; a **breakaway gap** (confirmed by a close beyond the prior swing) signals price will not return — it is in a hurry to reach the next liquidity pool.
- **Stages of distribution:** old accumulation zones inside the buy program become new distribution zones inside the sell program — prior bullish order blocks get "hammered" (retested) before price continues lower.
- **Time element:** highs/lows are expected to form inside anticipated **time macros** (e.g., a 20-minute window around 9:50–10:10 AM ET for the daily high/low), tying the model to killzone timing.

### How traders apply it
- Map the dealing range, mark DRT levels, identify whether price is in discount or premium.
- Wait for the consolidation → displacement → liquidity-run sequence; enter on the SMR/CISD with stops beyond the program extreme, targeting the opposing liquidity pool (dealing-range low/high or external highs/lows).
- Use inversion FVGs and breaker blocks as precision entries inside the new program.

### Common mistakes
- Calling every consolidation a program start (without a higher-timeframe draw on liquidity, it's just chop).
- Ignoring the time element — the model is time *and* price; entries outside killzones/macros are lower probability.
- Treating CISD candles loosely; the curriculum is specific about which candle's open must be violated.

### Connections
- MMXM is the programmatic big brother of **PO3** (same AMD logic, more precise measurement), uses **liquidity** as fuel, **FVGs/order blocks** as entry/inefficiency tools, **standard deviations** for targets, and **killzones** for timing.

---

## 5. MARKET STRUCTURE

### What it is (precise definition)
Market structure is the raw reading of trend from swing highs and lows, without indicators or trendlines: **higher highs (HH) + higher lows (HL) = uptrend**; **lower highs (LH) + lower lows (LL) = downtrend**; anything else = consolidation/range. The *integrity* of a trend is maintained by its corrective lows/highs (HLs in an uptrend); the first LL (in an uptrend) breaks that integrity and warns of a potential trend change.

### The mechanics (how/why it works)
- **Uptrend:** buy the HLs (the corrective pullbacks), targeting new HHs. **Downtrend:** sell the LHs, targeting new LLs. **Consolidation:** stand aside — no directional edge.
- **Break of structure (BOS):** continuation signal — price takes out the prior swing in the trend's direction, confirming trend continuation.
- **Change of character (ChoCh) / market structure shift (MSS):** the first break *against* the prevailing structure (e.g., a LL in an uptrend followed by a break below the last HL) — the early warning that the trend may be reversing. In ICT-flavored usage, MSS specifically means a displacement-backed break that shifts the tradable bias, often confirmed on the lower timeframe while the higher timeframe provides context.
- **Swing vs. internal (sub)structure:** structure is fractal. The *swing* structure is the higher-timeframe trend; *internal/substructure* is the lower-timeframe ebb and flow inside it. Traders use substructure breaks to time entries *with* the swing bias (e.g., short-term sells inside a larger downtrend's pullback, then flip long at the higher-timeframe demand zone).
- **Displacement:** the qualifier that separates real breaks from noise — an energetic, large-bodied move through a level (often leaving an FVG), as opposed to a weak wick-through.

### How traders apply it
- Establish bias on the higher timeframe (swing structure), then drop to lower timeframes for entry triggers (MSS + displacement).
- Place stops beyond the structural point that would invalidate the read (e.g., beyond the HL in a long); target the next structural liquidity (prior HH in an uptrend).
- In ranges, trade the edges only if the playbook allows it — otherwise wait for the BOS that starts the next trend leg.

### Common mistakes
- Calling trend on one timeframe while ignoring the opposing higher-timeframe structure (the classic "catching falling knives").
- Treating every minor swing break as a reversal instead of requiring displacement.
- Drawing trendlines and trading their breaks as structure (the curriculum explicitly rejects trendlines as arbitrary).

### Connections
- Structure gives the **bias** everything else serves; **liquidity** pools sit at structural highs/lows; **FVGs** qualify displacement breaks; **PO3/MM XM** describe how structure gets built session by session.

---
## 6. ORDER BLOCKS

### What it is (precise definition)
An order block is the last opposing candle (or small cluster of candles) immediately *before* a sharp displacement move — the footprint where large ("smart money") orders are understood to have been placed. In a bullish order block, it is the last down-close candle before price displaces upward; in a bearish order block, the last up-close candle before price displaces downward. The block's high-to-low range marks the zone where price is expected to return ("mitigation") and react before continuing.

### The mechanics (how/why it works)
- Big displacement requires big orders. The candle preceding the move is treated as the origin of that institutional flow, so when price revisits the zone, unfilled resting orders there are expected to defend it.
- The curriculum teaches three rules for a *valid* order block:
  1. **Inefficiency/displacement must be present** — the move away from the block must be sharp and leave a gap/imbalance (a weak drift away doesn't qualify; compare the before/after candle overlap).
  2. **It must create break of structure** — the displacement has to break a prior swing high/low, proving real intent rather than noise.
  3. **One-time use** — an order block is spent once mitigated. After price taps and reacts from it, the zone is considered used up; re-entries on the same block are lower probability.
- **Mitigation vs. break:** if price returns and holds the block (wicks, displacement away), the block did its job. If price closes *through* the block with displacement, it becomes a **breaker** — old support flips to resistance (or vice versa).

### How traders apply it
- The taught workflow: (1) identify displacement + BOS on a higher timeframe, (2) mark the order block at the move's origin, (3) wait for price to return to the block, (4) drop to a lower timeframe for a refined entry (a smaller-timeframe order block or FVG inside the zone), (5) stop beyond the structure extreme (e.g., below the last higher low in a long), (6) target the next opposing liquidity — the next order block or external high/low in the direction of the move.
- Minimum risk-to-reward discipline from the video: don't take setups below ~2:1; refine entries on lower timeframes to improve the ratio (the presenter showed a 1:1 improving to 1:5 by dropping from 15m to 5m for entry).

### Common mistakes
- Marking order blocks on moves with no displacement (no inefficiency = no institutional footprint).
- Re-trading an already-mitigated block.
- Entering at the block without waiting for the lower-timeframe confirmation — the "90% of retail" error the video opens with: buying the first retracement, getting stopped, then watching price rally without them.

### Connections
- Order blocks are the coarser cousin of **FVGs** (both mark inefficiency origins); they form at **market structure** break points; **breakers** are failed order blocks; and they are the zones **PO3/MM XM** distribution legs react from.

---

## 7. SMART MONEY TECHNIQUES (SMT) — DIVERGENCE

### What it is (precise definition)
SMT divergence is a non-confirmation between two correlated assets: when one makes a *lower low* but its correlated partner *fails* to make a lower low (bullish SMT divergence), or one makes a *higher high* while the partner fails to (bearish SMT divergence). The classic ICT pairs are **ES vs. NQ** (S&P 500 vs. Nasdaq futures) and **DXY vs. EURUSD** (dollar index vs. euro). The divergence signals that the move in the weaker/stronger asset lacks broad participation — a warning that the leg may be a liquidity grab rather than genuine continuation.

### The mechanics (how/why it works)
- Correlated assets should confirm each other's structural breaks. If ES breaks to a new low but NQ holds above its prior low, sellers lack conviction across the complex — the ES low is more likely a stop hunt (turtle soup) into buy-side liquidity than the start of real distribution.
- Traders use the divergence as *confluence*, not a standalone signal: e.g., ES sweeps sell-side liquidity while NQ prints bullish SMT divergence → higher-confidence long, targeting the nearest FVG or buy-side pool.
- The inverse (bearish divergence at highs) warns that a rally is running on one engine and may reverse into the opposing liquidity pool.

### How traders apply it
- Keep the correlated chart (e.g., NQ alongside ES) visible during killzones; check for divergence exactly at liquidity-sweep moments.
- Use divergence to *filter*: skip shorts when bullish SMT divergence is present at the lows, and vice versa.
- Combine with an entry model (MSS + FVG/order block) on the traded asset.

### Common mistakes
- Trading divergence alone without a sweep or structural trigger.
- Using uncorrelated or weakly correlated pairs (the technique only works where the correlation is structural, like index futures or dollar pairs).
- Forgetting that correlations break during regime shocks — divergence signals are probabilistic, not laws.

### Connections
- SMT is the cross-asset confirmation layer over **liquidity sweeps** and **market structure**; it often appears at **PO3 manipulation** extremes and **MMXM** program pivots.

> *Note on the curriculum video:* the video linked for this topic was a broad ICT-concepts overview (covering liquidity/ERL/IRL, market structure, MMXM, PO3, and entry models) rather than a dedicated SMT-divergence lesson. Its distinctive teachings are folded in below; SMT divergence itself is covered here from standard ICT material so the concept is complete.

**From that overview video — entry models & timeframe alignment (worth preserving):**
- **Three entry models taught:** (1) *Inversion FVG* — after a key level is tapped, a lower-timeframe FVG that gets closed through in the reversal direction is the entry trigger; (2) *Change in state of delivery (CISD)* — when the candles in control flip (e.g., down-close candles engulfing up-close candles get engulfed back), signaling the auction has changed hands; (3) *Market structure shift* — displacement through a structural level with an FVG, confirming the new direction.
- **The "key level" rule:** no trade without a higher-timeframe key level tapped first (a liquidity pool, FVG, or swing point). The key level is what makes the entry high-probability; the entry model is just timing.
- **Timeframe alignment ladder:** the key level lives 2–3 timeframes above the entry. Example ladder given: weekly key level → 4H market-maker/entry model → lower-timeframe execution. Trade the displacement, not the chop.
- **IRL → ERL magnet flow:** price oscillates from internal-range liquidity (FVGs) to external-range liquidity (swing points); once a new FVG forms after reaching a swing, expect price to trade back into the FVG, then on to the next swing — the endless liquidity-to-liquidity cycle.

---
## 8. STANDARD DEVIATIONS (PROJECTIONS)

### What it is (precise definition)
Standard-deviation projection is ICT's method for forecasting *how far* a distribution leg will travel: take the **manipulation leg** — the swing that swept liquidity immediately before the smart-money reversal / change in state of delivery — and project its range outward using Fibonacci extension levels relabeled as standard deviations. The curriculum's taught levels are **-2 to -2.5** (first major objective) and **-4** (maximum expansion), with -1 as a minor waypoint. In practice this is done with TradingView's Fib retracement tool set to 1, 0, -1, -2, -2.5, -4.

### The mechanics (how/why it works)
- **Anchoring:** identify the manipulation leg precisely — e.g., in a bearish reversal, the low-to-high swing that swept buy-side liquidity before price displaced down. Project *from* the reversal extreme *through* the leg's origin (high-to-low for shorts, low-to-high for longs).
- **Reading the levels:** at -2 to -2.5, expect either a retracement or a reversal — it is a decision zone, not an automatic target. If price *displaces and closes through* -2.5, the measured objective becomes -4, the "maximum expansion" of the leg.
- **After max expansion:** mark the discount/premium of the whole projected leg and expect price to retrace toward its equilibrium (50%) — expansions exhaust into rebalancing.
- **Confluence stacking:** the real power comes from pairing projections with **PD arrays** (premium/discount arrays — ICT's term for points of interest: FVGs, order blocks, equal highs/lows, liquidity pools). A -2.5 level that lands on resting sell-side liquidity or an old order block is far higher probability than a naked fib level. Multiple projections overlapping (e.g., one leg's -4 aligning with another leg's -2.5) compounds the confluence.
- **Fractal use:** projections work top-down — anchor a manipulation leg on the hourly to get the day's objective zone, then drop to 1–5 minute charts to find the entry that targets it.

### How traders apply it
- After every confirmed SMR/MSS, immediately project the manipulation leg; mark -2/-2.5 and -4 as the roadmap before looking for entries.
- Take partial profits at -2.5 (the "low-hanging fruit" — often resting liquidity just beyond it), and trail or hold runners toward -4 only if displacement confirms through -2.5.
- Never project from arbitrary swings — the anchor *must* be the liquidity-sweeping manipulation leg, or the levels are meaningless.

### Common mistakes
- Anchoring the fib on the wrong leg (any random swing instead of the post-sweep manipulation leg).
- Treating -4 as guaranteed; it is the *maximum* measured expansion, and price often reverses at -2.5.
- Using projections without PD-array confluence — a lone fib level in empty chart space is low probability.

### Connections
- Projections are the measuring tape for **PO3 distribution** and **MMXM** program targets; they turn **liquidity** locations into quantified objectives; entries at the projected zones use **FVG/order-block** models.

---

## 9. KILLZONES (SESSION TIMING)

### What it is (precise definition)
Killzones are specific time windows in the trading day when institutional volume arrives and price is most likely to *expand* (trend) rather than chop. They are **timing filters, not strategies and not entries** — they tell you *when* to pay attention, never where to buy or sell. The core principle: show up when the market moves, stand down when it doesn't.

### The sessions (Eastern Time, as taught)
| Killzone | Window (ET) | Character |
|---|---|---|
| **Asian** | 8:00 PM – 12:00 AM | Consolidation; builds the range whose highs/lows London will later target. Low volume except AUD/NZD/JPY pairs and occasionally gold. |
| **London** | 2:00 AM – 5:00 AM | Volatility expansion for EUR/GBP/CHF and gold. Frequently raids the Asian high/low (the manipulation), and often prints the high or low of the day. |
| **New York AM** | 7:00 AM – 10:00 AM (indices: 9:30 AM – 12:00 PM) | Reacts to London's move: typically retraces/rebalances, then continues *or* reverses. Cleanest continuation entries. By now the day's context (bias, key levels) is established. |
| **London close / NY lunch** | 12:00 PM – 1:00 PM | Low-probability window: profit-taking and repositioning, not new expansion. For closing trades, not opening them. |
| **New York PM** | 1:00 PM – 5:00 PM | Quieter; the 3:00–4:00 PM "power hour" can offer one last push. Session highs/lows become reference liquidity for the next day. |

### The mechanics (how/why it works)
- **The typical daily profile:** Asia consolidates (accumulation) → London sweeps the Asian high/low and expands (manipulation + early distribution) → New York retraces into the London move → then continuation or reversal into the afternoon.
- **Continuation vs. reversal days:** if London expands aggressively *and holds structure*, expect New York continuation. If London sweeps a key level but fails to follow through (no displacement), stay open to a New York reversal. You don't predict which — you let the market show you.
- **Higher-timeframe context rules:** a sweep alone is not a reversal signal. If HTF bias is bullish and London expands upward, the deeper target (e.g., a 4H bullish FVG) outranks the swept London low. The analogy taught: the HTF target is "school," the sweep point is "home" — price stops at the nearest bookstore (rebalance zone), not all the way home.
- **Macro timing inside killzones:** the MMXM curriculum narrows entries further to ~20-minute "macros" (e.g., expecting the daily high between roughly 9:50–10:10 AM ET) — time windows *within* the killzone where turning points cluster.

### How traders apply it
- Trade only 1–3 setups per day, only inside killzones, only with HTF context aligned. Outside the windows: no forced trades.
- Mark each session's high/low; they become the next session's liquidity targets.
- Pick the sessions that fit your life and give them full attention rather than watching charts all day.

### Common mistakes
- Treating killzone entry as a signal ("price is in the killzone, I must trade") — the #1 misuse.
- Trading the dead windows (Asian chop for non-Asian pairs, lunch hour) and wondering why setups "don't work."
- Taking every session's setups instead of specializing in one or two.
- Ignoring HTF context and fading every sweep.

### Connections
- Killzones are the **time** axis of the time-and-price model: **PO3** phases map onto sessions (Asia = accumulation, London = manipulation, New York = distribution); **MMXM** macros live inside them; every entry model (**FVG**, **order block**, **MSS**) is filtered by them.

> *Note:* the video makes strong personal profit claims; they are not reproduced here. Killzones raise the probability of trading *with* volume — they do not guarantee outcomes, and position sizing and stop discipline remain mandatory.

---

## 10. MARKET STRUCTURE — PART 2 (BEGINNER REINFORCEMENT)

The second market-structure video is a simplified "ICT for Dummies" walkthrough of the same HH/HL/LH/LL framework as Section 5, aimed at traders still learning to read candlesticks. Its distinctive emphases: practice identifying trend on real charts (including using line charts if candlesticks are confusing), never fight the higher-timeframe trend ("the chart with the highest timeframe is the strongest"), and that real swing points are messier than textbook diagrams. No new mechanics beyond Section 5 — it is drill material for the same skill.

---

## 11. FUTURES FUNDAMENTALS

### What a futures contract is (precise definition)
A futures contract is a standardized, exchange-traded agreement to buy or sell a specific quantity of an underlying asset (an index, commodity, currency, bond, or crypto) at a predetermined price on a specific future date. Unlike buying a stock — where you own a piece of a company indefinitely — a futures position is a *contract obligation* with an expiration: at expiry the contract is settled (in cash for index futures like ES/NQ, or by physical delivery for some commodities). Most retail traders never hold to expiry; they open and close positions intraday to profit from price movement, and the position is marked to market daily.

### How futures differ from stocks, forex, and options
- **vs. stocks:** stocks are ownership with no expiry; futures are time-limited contracts. Futures trade nearly 24 hours (CME Globex), offer built-in leverage via margin, and let you short as easily as going long with no uptick rule or borrow requirement. Stocks settle T+1; futures settle daily to market.
- **vs. forex (spot FX):** spot forex is decentralized/OTC with no central exchange; futures are exchange-traded and centrally cleared, so pricing is transparent and counterparty risk sits with the clearinghouse. Currency futures exist (e.g., 6E for euro), but equity-index futures (ES, NQ) are the day trader's main arena.
- **vs. options:** options give the *right* (not obligation) and their price decays with time (theta); futures are linear — one point of index movement equals a fixed dollar amount, with no time decay working against the holder. That linearity is why intraday ICT-style traders prefer futures: the P&L math is simple and stops/targets map directly to points.

### Why traders use futures
1. **Liquidity:** ES (E-mini S&P 500) and NQ (E-mini Nasdaq-100) are among the most liquid instruments on earth — tight spreads, deep books, instant fills, minimal slippage even at size. Micros (MES, MNQ) extend that liquidity to small accounts.
2. **Standardized contracts:** every contract has fixed specs — no ambiguity about what you're trading.
3. **Regulated structure:** traded on the CME, cleared centrally, with segregated customer funds — a stronger investor-protection framework than OTC forex/CFDs.
4. **Leverage (the double-edged sword):** futures margin is a performance bond, not a loan — a few thousand dollars controls a contract worth hundreds of thousands in notional value. This magnifies both gains *and* losses symmetrically; a 1% adverse move on 20:1 notional leverage is a 20% account hit. Leverage is the reason futures demand strict position sizing and hard stops — it is the single biggest account-killer for new traders.

### Know your contract — the checklist (before trading any symbol)
- **Tick size:** the minimum price increment (e.g., NQ moves in 0.25-point ticks; ES in 0.25-point ticks).
- **Tick value:** dollars per tick. The ES/NQ examples from the curriculum video: NQ ≈ $20 per point ($5.00 per 0.25 tick); ES = $50 per point ($12.50 per 0.25 tick); micros = 1/10th of the minis (MNQ $2/point, MES $5/point). The video's illustration: a 110-point NQ move ≈ $2,200 per contract vs. a 30-point ES move ≈ $1,500 — the same market move pays differently per contract, which is why NQ offers more short-term opportunity per structural swing.
- **Contract size / multiplier:** the dollar value of one full point (NQ = $20/point; ES = $50/point; MNQ = $2/point; MES = $5/point). This converts "points of stop" into dollars of risk.
- **Margin:** the performance bond required per contract — *intraday* margin (set by the broker, much lower) vs. *overnight/initial* margin (set by the exchange, much higher). The video's worked example: with a $500 intraday minimum and a $550 account, a 1-point adverse move on ES ($50) leaves $500 — one more tick against you and the position is auto-closed, typically with a broker fee. The account needs breathing room *beyond* the minimum. Day traders size off intraday margin; swing traders off initial margin; requirements differ by broker.
- **Expiration:** index futures expire quarterly (Mar/Jun/Sep/Dec); crypto and some others monthly. Know the roll calendar — volume migrates to the front-month contract, and trading the back month means wide spreads.
- **Trading hours:** CME equity futures trade nearly 24/5 (Sunday 6 PM ET open through Friday 5 PM ET close, with a daily 15-minute halt). Know when *your* session's liquidity lives: the ICT killzones map onto these hours (Asian range, London, New York).

### From the curriculum's futures video (practical color)
- **ES vs. NQ personality:** ES (E-mini S&P 500) is the most traded contract, suited to medium-to-large moves; NQ (E-mini Nasdaq-100) is described as a "scalper's paradise" — far more points per structural move, hence more intraday opportunity *and* more risk per contract.
- **They rhyme, then diverge:** ES and NQ usually move together, but the video shows concrete divergences (ES bouncing off a prior low while NQ slices through it) — the same non-confirmation logic as **SMT divergence**, applied to contract selection and bias-checking.
- **Learn on SIM, then micros:** the video's explicit progression — prove the strategy on a simulator account first, *then* trade micros (1/10th size) to learn with real fills and emotion at small dollar risk, before ever touching a mini contract.
- **Why futures fit this curriculum:** "no Greeks like options — what you see is what you get." Linear P&L keeps the ICT math (points in, dollars out) clean.

### How this connects to the ICT concepts
- Every ICT entry model (FVG, order block, MSS) is measured in **points**, but risk is managed in **dollars** — tick value is the conversion layer. A "20-point stop" means $400 on NQ, $100 on MNQ, $1,000 on ES.
- **Standard-deviation projections** (PO3/MM XM targets) output point distances; multiply by tick value to get dollar targets and verify they fit the account's risk budget.
- The nearly-24-hour session is *why* killzones and the Asian/London/New York AMD template exist — futures are the native market this entire curriculum was built for.

### Common mistakes
- Trading the mini (NQ/ES) with a small account instead of the micro (MNQ/MES) — same chart, 1/10th the risk per point.
- Ignoring the contract roll and trading an expiring contract with thin volume.
- Confusing intraday margin with overnight margin and getting liquidated or margin-called holding past the cutoff.
- Sizing by "number of contracts that feels right" instead of by dollars of risk per the tick-value math.

---
## HOW THE CONCEPTS COMBINE — BUILDING A TRADING MODEL

### The workflow: LEARN → STUDY → BACKTEST → JOURNAL → REFINE
The curriculum's prescribed loop, and the honest version of what each step demands:
1. **LEARN** — study one concept at a time until you can define it precisely (this document is the learn step).
2. **STUDY** — replay historical charts bar by bar; mark up liquidity pools, structure, killzones, and FVGs until pattern recognition forms.
3. **BACKTEST** — define the full model as *written, falsifiable rules* (bias condition + trigger + entry + stop + target + session filter + max trades/risk per day), then score at least 50–100 historical setups. Track win rate, average R, max drawdown, and performance by session and by market regime (trend vs. chop). A model that only works in one regime is not a model — it is a conditional tactic.
4. **JOURNAL** — log every live/paper trade with screenshots: why you took it, which checklist boxes it ticked, how you managed it, what the market did after. Review weekly for repeated errors (the journal is where "trading too often, trading dead hours, trading without HTF context" gets caught).
5. **REFINE** — change *one variable at a time* (e.g., entry timeframe, or the session filter), then re-backtest. Never overhaul the model on a single loss or a single win.

### The canonical full-model stack (example assembly)
This is the standard way the concepts string together into one trade — the template Claude should use when helping design strategies:

1. **Higher-timeframe bias (Market Structure):** Daily/4H trend is up (HH/HL intact) → only longs.
2. **Draw on liquidity (Liquidity):** the objective is buy-side — resting stops above equal highs / the prior session high.
3. **Timing (Killzones):** wait for the New York AM killzone (or the chosen session); no entries in dead hours.
4. **The setup (PO3/MM XM):** Asian range = accumulation → London sweeps the Asian low (manipulation) → look for the reversal signature as New York approaches.
5. **The trigger (MSS/CISD + displacement):** on the 5m/1m, a market structure shift with displacement through the manipulation extreme, leaving a fresh FVG.
6. **The entry (FVG / Order Block / IFVG):** limit entry at the FVG's consequent encroachment (or the inversion zone), stop beyond the sweep extreme.
7. **The target (Standard Deviations + liquidity):** project the manipulation leg; take profit at the -2 to -2.5 zone *if* it aligns with the resting buy-side pool; runner only on displacement through it.
8. **The filter (SMT):** require NQ to confirm ES's structure (no bearish divergence at the highs).
9. **Risk (Futures math):** convert the point stop to dollars via tick value; size so the loss is a fixed fraction of the account (e.g., 1%); hard daily stop after 2 consecutive losses or the daily loss limit — whichever comes first.

### What to demand of any strategy Claude helps build
- **Written rules** with no discretionary gaps ("enter on MSS" is not a rule; "enter on a 5m close through the swept high that leaves an FVG ≥ 4 points, stop 2 points beyond the sweep wick" is).
- **Invalidation stated up front** for every idea (what market behavior proves this thesis wrong *today*).
- **Regime awareness:** which market condition the model needs (trending vs. ranging, which session), and an explicit stand-down rule for the rest.
- **Cost accounting:** commissions + fees per round trip on the specific contract (mini vs. micro) subtracted in every backtest.
- **No outcome promises:** a model is a hypothesis with measured historical performance, not a profit guarantee. Forward-test on SIM before any capital is risked.

---

## COVERAGE NOTE

**Transcripts successfully fetched (11 of 11 curriculum videos + 1 bonus):**
- Liquidity 1 (`Njs-eRpeP9Q`) — via transcript-viewer fallback after repeated YouTube 429s; covered fully.
- Liquidity 2 (`uuWKiMNGHto`) — via yt-dlp captions.
- Fair Value Gaps (`zwvtv0gBSdc`) — via yt-dlp captions.
- Power of Three (`TCFvsZeYvV8`) — via yt-dlp captions.
- Market Maker Models (`zQOAE4Hz8II`) — via yt-dlp captions.
- Market Structure 1 (`ygleB1CLhUE`) — via yt-dlp captions.
- Market Structure 2 (`pBqjCsQ3YS0`) — via yt-dlp captions (beginner-level reinforcement of the same framework).
- Smart Money Techniques (`Q7Ryv1M7CvI`) — via yt-dlp captions; note: the video itself was a broad ICT-concepts overview (liquidity, structure, MMXM, PO3, entry models, timeframe alignment) rather than a dedicated SMT-divergence lesson, so SMT *divergence* is covered here from standard ICT material and the video's entry-model teachings are preserved in Section 7.
- Order Blocks (`MxygA1AFspI`) — via yt-dlp captions.
- Standard Deviations (`kTWXpAo1uE8`) — via yt-dlp captions.
- Killzones (`UVBtQKooOAU`) — via yt-dlp captions.
- Bonus futures video (`l6CaHkTARx4`) — via yt-dlp captions; folded into Section 12 (Futures Fundamentals).

**Covered from general ICT knowledge (no transcript needed):** the "UNDERSTANDING FUTURES" lesson text referenced in the task was not present in the provided material, so Section 12 was built from the task's own outline (what futures are; vs. stocks/forex/options; why traders use them incl. the leverage double-edged sword; the tick size → tick value → contract size → margin → expiration → trading hours checklist) plus the futures video above — all standard, non-proprietary facts.

**Copyright method:** all concepts are explained in original wording. No transcript passages are reproduced verbatim beyond a few short standard terms (e.g., "turtle soup," "draw on liquidity"), which are common ICT vocabulary.
