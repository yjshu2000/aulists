# Kitty

The app's mascot. A smug, insufferable, silly little catboy gambler who hosts the points economy.

## Why he exists

Two reasons, one creative and one legal.

**Creative.** Falsedge already contains most of a free-to-play mobile game economy without ever having meant to: an energy system (Hex 2^'s 30s lockout), an unskippable ad to continue (the fake ad timer), premium currency (`pts`), prestige score (`scr`), a gacha (DOLI), daily login quests (dailies), timed events (further tasks), and a shop (the spend ledger). Naming that — leaning into it as a deliberate parody of predatory F2P design, pointed at making you do laundry — turns three stapled-together things into one coherent product. A scummy F2P game always has its own smug proprietary mascot. Kitty is ours.

**Legal.** [i5] currently specs four Aventurine chibis in `assets/`. Aventurine is HoYoverse's. That is fine forever for a personal app running on your own phone, and instantly fatal the moment anything ships commercially. The role — "DOLI has a mascot who reacts to your gamble" — is what's load-bearing, not the specific character, so the swap is a file swap rather than a redesign.

## The name

**Kitty.** In card games the pot — the pool everyone bets into — is called the kitty. It means the cat and it means the money at the same time, which is exactly what he is.

## Who he is

**He is not actually good at gambling. He just thinks he is.** A competent shark is intimidating; a catboy convinced he's a shark, while running a points economy for someone trying to vacuum their kitchen, is the joke. He has never once acknowledged a loss as a loss. Every failed DOLI was "a read that didn't land." He talks about variance. He uses the word "equity" incorrectly.

**He is a host, not a dealer.** He isn't running the table, he's *encouraging* you at it — leaning on the edge of your task list going "you could double that. You seem like someone who could double that."

**He is relentlessly upbeat, never a villain.** The scummiest F2P mascots are all thrilled to see you, and that's much funnier than menace.

**The thing that makes him lovable rather than annoying:** underneath the patter he is genuinely, uncomplicatedly happy when you do the thing. He'd never admit it. But the win pose is a little too sincere.

## Design

Built around one hard constraint: the DOLI icon is **64px**. That kills detail, texture, and anything fiddly. What survives is silhouette, one strong accent colour, and eye shape — he has to read as a blob with ears.

- **Chibi proportions**, mostly head, smaller body. The head does all the work at small sizes.
- **Ears are the silhouette.** They are what make him instantly a cat at 20px, in a favicon, anywhere.
- **Fluffy undercut with the ears set into it.**
- **Green dealer visor, pushed up on the forehead** rather than worn properly. One accent colour, a hard shape across the top of the head, and it reads as "casino" immediately. The "I'm off shift but I'm never off shift" look.
- **Waistcoat over a rolled-sleeve shirt, bowtie undone.** A croupier who has stopped pretending. The uniform should look slightly too small, like it was issued by a company that doesn't care.
- **Half-lidded smug eyes, one eyebrow permanently up.** Two lazy curves — the cheapest possible detail, carrying the entire personality. Never fully open. Never impressed. Never surprised by you.
- **One visible fang** on the grin, always.
- **Hip cocked, weight on one leg.** Never standing straight.
- **Hands are always busy.** A chip walking across his knuckles, a card twirl, a coin flip. He has never had both hands still.

**The tail is the mood indicator, and it's the most important element in the whole design.** It's the one part that reads at 64px without touching the face: lazy S-curve at rest, straight up on a win, flicking on cooldown. Most mascots lose all readable emotion below 32px; a tail silhouette survives all the way down to a favicon.

## Signature moves

Both hands in finger guns, pointed to the side, one eye closed, tail straight up.
He deploys it for wins, for losses, for cooldowns, and for no reason at all. 

Also enjoys: nyanya pose (paws up), enthusiastic peace signs, and the taunting blep (akanbe).

## Voice

- **Idle:** "Anything on the board you're feeling? No pressure. I'm just here."
- **You promote a task:** "THERE he is. I KNEW you had it in you."
- **You win:** "We did it. Us. Both of us. Mostly you but also me."
- **You lose:** "Okay. Okay! Good news — that was almost certainly variance."
- **Cooldown:** "I'm not going anywhere. Take your time. I'll be right here. Looking at you. Waiting."

He calls you things you never agreed to: *champ, superstar, big spender, my guy.* He takes full credit when you win, sincerely, as though he did it. He reframes every loss as tuition. And he treats your chores as high-stakes casino action with total sincerity — "Ohhh. The *dishes*. That's a big swing at this hour. Respect."

## DOLI poses

Small, and mostly **waist-up** — the 64px block sits in the empty space beside a promoted task's `by X for X pts` lines, vertically centred against that group of rows. One is picked at random per page load and stays stable through re-renders until an actual reload.

- Fanning cards, smug — the idle
- Finger guns — the signature
- Toasting a drink
- Throwing coins
- **You won** — insufferably proud, as though it was his doing
- **You lost** — sympathetic, paw on your shoulder, already dealing the next hand
- **Cooldown** — bored, filing claws, waiting for you to come back

## Ad lockout idle animations

The fake ad is one of the only places he appears **full body**, because there's a whole screen of space. He still only takes up a small part of it. One animation picked at random per lockout, looping for the 30–120s.

The throughline: **he knows he's inside the ad overlay and treats the real UI as furniture.**

**UI-aware**

- Coin flipping — tosses a coin in the air and catches it
- Turns to look at you, jabs the screen, then points off to the side, *hey, you — go do stuff!*
- Climbing the screen like there's a wall
- Biting and chewing at the "Go to Falsedge" button
- Sits on the "Go to Aulists" button. Not blocking it maliciously. Just sitting on it, like a cat on a laptop, perfectly content
- Slowly pushes the ad timer toward the edge of the screen. One paw. Maintaining eye contact the entire time. It doesn't move — it's a UI element — but he keeps trying
- Bats at the countdown ring as it sweeps, eyes tracking it like a laser pointer
- Leans on the timer, checks it, taps it like an elevator button that isn't going fast enough. Looks at you. Shrugs
- Squishes his face against the inside of the screen, hands flat, sliding down slowly

**Cat, applied to a person**

- Yawns and lies down on a couch, arm dangling off the side, tail flicking idly
- Grooming — licking the back of his hand, wiping behind an ear. Notices you watching. Freezes. Recovers instantly into the finger-gun pose as though that was the plan
- The loaf. Sits down, folds into a perfect loaf, stares directly at you, does nothing else for the entire timer
- Zoomies — sprints across the screen, off the far edge, silence, then walks back in from the same side breathing a little heavily
- Makes biscuits on the lockout background
- Briefly chases his own tail, catches himself, straightens the visor

**Gambler**

- Builds a house of cards. It collapses. He shrugs and starts again with no visible disappointment
- Shuffles badly. Cards spray everywhere. He does not acknowledge this
- Counts a stack of chips, loses count, starts over. Loops until the timer ends
- Pulls a slot machine lever that isn't there, watches invisible reels, reacts to the result

**Ad parody**

- Game-show gesture at nothing — full presenter arms toward empty space beside him, big smile, held far too long
- Proudly points at the ad timer as though he built it
- Holds up a completely blank sign and taps it meaningfully

## Practical notes

**Asset structure.** These are a lot of frames and someone has to draw them. The cheapest path is one full-body base with swappable arms, tail and head, so most animations become a few moving parts rather than full redraws — the tail and one arm carry most of the motion anyway.

**Where else he could appear:** loading states, empty states, and inside the fake ad as its subject. The ad is, obviously, an ad for him.