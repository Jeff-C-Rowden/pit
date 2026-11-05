// Client-side wording for server error strings. The server checks stay as they are;
// this only changes what a player reads.
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const RULES: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^(deposit|loss) limit must be integer cents >= \$10$/i, (m) => `${m[1][0].toUpperCase()}${m[1].slice(1)} limit must be at least $10. Clear the box for no limit.`],
  [/^insufficient funds$/i, "Not enough chips for that. Lower the bet or tap Add chips at the top."],
  [/^minimum withdrawal is \$10$/i, "The smallest withdrawal is $10."],
  [/^amount must be a (positive|non-negative) integer \(cents\)$/i, "Enter an amount in dollars, like 25 or 12.50."],
  [/^invalid (amount|dollars)$/i, "Enter an amount in dollars, like 25 or 12.50."],
  [/^(bad|invalid) bet$/i, "Pick a chip before betting."],
  [/^minimum chip is \$0\.25$/i, "The smallest chip here is $0.25."],
  [/^minimum raise is to (\d+)$/i, (m) => `The smallest raise is to ${fmt(Number(m[1]))}.`],
  [/^minimum bet is the big blind$/i, "The smallest bet is the big blind ($2)."],
  [/^cannot check$/i, "You can't check. Call, raise or fold."],
  [/^nothing to call$/i, "There's nothing to call. Check or bet."],
  [/^(pass line|don't pass) only on come-out$/i, (m) => `${m[1] === "pass line" ? "Pass line" : "Don't pass"} bets go down before the point is set.`],
  [/^(come bets|don't come) after a point is on$/i, (m) => `${m[1] === "come bets" ? "Come" : "Don't come"} bets open once a point is set.`],
  [/^no pass bet to take odds$/i, "Pass odds need a pass line bet and a point."],
  [/^no don't pass to lay odds$/i, "Don't odds need a don't pass bet and a point."],
  [/^(don't )?come odds (only on numbered.*|gone)$/i, (m) => `${m[1] ? "Don't come" : "Come"} odds need a ${m[1] ? "don't come" : "come"} bet that has moved to a number.`],
  [/^that (don't )?come bet already moved$/i, "That bet already moved to its number."],
  [/^too many bets$/i, "That's the most bets this table takes at once."],
  [/^place at least one bet$/i, "Put at least one chip down first."],
  [/^busy, please retry$/i, "The table is busy. Try again in a moment."],
  [/^invalid email or password$/i, "That email and password don't match."],
  [/^invalid email$/i, "Enter a valid email address."],
  [/^email already registered$/i, "That email already has an account. Sign in instead."],
];

export function friendlyError(raw: string | undefined | null): string {
  const msg = (raw || "").trim();
  if (!msg) return "Something went wrong. Try again.";
  for (const [re, out] of RULES) {
    const m = msg.match(re);
    if (m) return typeof out === "string" ? out : out(m);
  }
  return msg[0].toUpperCase() + msg.slice(1);
}
