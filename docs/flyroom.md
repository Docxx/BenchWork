# Fly room

Fly room is a personal module: fly stocks, a cross planner and crosses tracked from set-up to
collecting. It lives in `src/personal/flyroom` and, like Label Studio in `src/personal/labels`,
is built in only on a computer whose `.env.local` sets `VITE_PERSONAL=1`. Builds anywhere else
leave both out entirely. Switch it on in Settings > Modules.

## Stocks

Each stock is a small file, such as `Fly room/Stocks/w1118.flystock.yaml`. Fly stocks made by
the Inventory module are the same kind and show here too. A stock has its genotype, source and
stock number, where it is kept, its status (Healthy, Quarantine, Weak or Dead), when it was
established, alleles that kill in two copies, and how often it is flipped.

Genotypes are written chromosome by chromosome, `X ; 2 ; 3 ; 4`, with a slash between a
chromosome's two copies: `w ; Sco/CyO ; TM3/TM6 ; +`. One entry means both copies are the same.

Import CSV adds stocks from a spreadsheet, such as the Drosophila Lab Manager's Export CSV. It
finds the columns by their headings (name, genotype or X/2/3/4 columns with their balancer
columns as second copies, source, Bloomington number, date added, status, notes). Rows where a
name or genotype with a comma was not quoted are mended. Every row becomes a stock, repeats
included; a stock already here with the same name and genotype is skipped, so importing a file
again adds nothing.

## Cross planner

Choose the virgin females and the males, from stocks or typed in. The planner lists every kind
of progeny by sex, with its share, the markers to sort it by ("Cy, Sb; not Hu, Sco"), and
marks those free of balancers. Flies with two copies of a balancer, of a lethal marker, of an
`l(…)` allele or of an allele the stock lists as lethal are left out, and the rest share 100%.
A note warns when the mother's chromosomes could recombine. Recombination itself is not
modelled.

From any kind of progeny: track a cross for it, cross it on (it becomes a parent in the
planner), or save it as a new stock.

## Crosses

A cross is a file such as `Fly room/Crosses/w × CyO.flycross.yaml`. From its set-up date and
temperature it gets a timetable: when to move the parents on, when the first progeny hatch,
the window for collecting virgins, and the last day before the next generation hatches. The
usual timings:

| Temperature | Move parents | First hatch | Last day | Collect virgins every |
| ----------- | ------------ | ----------- | -------- | --------------------- |
| 18 °C       | day 6        | day 19      | day 36   | 16 hours              |
| 25 °C       | day 3        | day 10      | day 18   | 8 hours               |
| 29 °C       | day 3        | day 8       | day 15   | 6 hours               |

Ticking steps off moves the cross on to Collecting and then Done. Steps due show on the Home
card Fly room today, with stocks due a flip, and on the calendar. A cross crossed on from
another keeps a link to it, so a scheme can be followed back to its first parents.

Print a label opens Label Studio, where stocks and crosses can fill a label.
