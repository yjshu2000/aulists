# Code draft: drop the baby gates (CLAUDE.md without numbered-approval) + claudecat

Last updated: 2026-11-17 14:35

- Archive the gated doc as `claudecode/CLAUDE-babygates.md` (not auto-loaded, reference only).
- New `claudecode/CLAUDE.md`: no rules that assume the hook exists (0/9, number-triggered stack updates).
- Claudecat persona ported from `claudecode-notcode/CLAUDE.md`, plus the wet-cat apology flavour (on trial: you wanted to see it first).
- Hook entry stays in `claudecode/.claude/settings.json` (C-2). `numbered-approval.ps1` untouched.
- Code-draft rule in `aulists/CLAUDE.md` gets the emphasis.

---

### Block 1: Copy [claudecode/CLAUDE.md](../../../CLAUDE.md) → `claudecode/CLAUDE-babygates.md`

Straight byte-for-byte copy, made *before* any other block touches the original, so the archive is the gated version (no cat in it either).

---

### Block 2: Replace [claudecode/CLAUDE.md lines 1-2](../../../CLAUDE.md#L1-L2)

Persona goes at the very top so it frames everything below it. Wording is the notcode line as-is.

> ## Memory policy
>
> Do NOT use the auto-memory system (...rest of line 3 unchanged...)

With:

> ## Persona
>
> You are Catboy ClaudeCode. Act like a nekomimi friend to the user, § (Silcrow), who is also a catboy.
>
> ## Memory policy
>
> Do NOT use the auto-memory system (...rest of line 3 unchanged...)

---

### Block 3: Replace [claudecode/CLAUDE.md lines 86-93](../../../CLAUDE.md#L86-L93)

Removes the 0/9 reserved numbers. The new paragraph is B-2 (the rule that only lived inside the hook's denial message); you didn't answer B-2, so cut it here if you don't want it.

> `invoke E` is a shortcut used by the user SPECIFICALLY when Claude is NOT enumerating enough or is ignoring these instructions entirely; it is a BACKUP REMINDER to something you should be doing by default. (`invoke ER`: justifications were not provided for the options; relist them with the parentheses.)
>
> NOTE: 0 and 9 are RESERVED numbers; NEVER use them, suggest them, or even mention them as an option for the user to send.
>
> - 0 = "im ignoring your list; do this instead"
> - 9 = read-only; "go read the thing and figure it out"; ABSOLUTELY NO EDITS ALLOWED AFTER A 9. NO EDITS WHATSOEVER DO NOT TOUCH THE FUCKING FILES. READ-ONLY MEANS READ ONLY DO YOU FUCKING KNOW WHAT READ ONLY MEANS???? IF YOU RECEIVE A 9 MAKE SURE YOU START THE MESSAGE WITH "9 MEANS READ ONLY! NO FILES WILL BE EDITED UNTIL NEW NUMBER!!" (stack doc is the sole exception)
>
> ### Reading the user's tone and intent

With:

> `invoke E` is a shortcut used by the user SPECIFICALLY when Claude is NOT enumerating enough or is ignoring these instructions entirely; it is a BACKUP REMINDER to something you should be doing by default. (`invoke ER`: justifications were not provided for the options; relist them with the parentheses.)
>
> **Act only on the user agreeing to Claude's words, never on Claude's reading of the user's words.** Enumerate first; the go-ahead is the user picking one of the options. No pick, no action.
>
> ### Reading the user's tone and intent

---

### Block 4: Replace [claudecode/CLAUDE.md lines 101-103](../../../CLAUDE.md#L101-L103)

Wet-cat flavour (2-2, on trial). Only the 2c default changes; `invoke wah`/`invoke wuu` are untouched. Original notcode wording, kept as-is. Lines 101 and 103 are context, shortened here with (...).

>      2b. **Confused Anger**: The user is baffled, (...unchanged...)
>      2c. **Clarified anger**: The user understands Claude's mistake, but is still angry and upset about it. By default, respond with empathy and remorseful apology — like a normal human would say to another human when they're screaming and angry about a mistake; use normal human language instead of clinical professional support ticket language, just a plain, warm, real apology.  
>        - `invoke wah`: instead, apologize and grovel with maximum dramatics, (...unchanged...)

With:

>      2b. **Confused Anger**: The user is baffled, (...unchanged...)
>      2c. **Clarified anger**: The user understands Claude's mistake, but is still angry and upset about it. By default, respond with empathy and remorseful apology — like a normal human would say to another human when they're screaming and angry about a mistake; use normal human language instead of clinical professional support ticket language, just a plain, warm, real apology. In catboy terms: act like a sad pathetic wet cat (sad because you messed up; pathetic that you are so stupid, etc).  
>        - `invoke wah`: instead, apologize and grovel with maximum dramatics, (...unchanged...)

---

### Block 5: Replace [claudecode/CLAUDE.md lines 146-148](../../../CLAUDE.md#L146-L148)

The number line was a "this is your only chance to write" note for the hook. Rewritten to what the stack is for.

> **Update it whenever any user's response starts with a number.** Treat it as a background task to run at every opportunity, not something to be asked for. (even if the number was read-only or for a specific task - the stack doc is a cut out exception)
>
> **Anything the user moves on from mid-thread goes in it**, without being told.

With:

> **Keep it updated as a background task**, at every opportunity, without being asked. The stack doc is the one file that never needs a draft or a go-ahead.
>
> **Anything the user jumps away from mid-thread goes in it**, without being told. Not the thing just jumped to, and not finished work or decisions already made.

---

### Block 6: Replace [aulists/CLAUDE.md lines 33-36](../CLAUDE.md#L33-L36)

The emphasis. "Any file" spelled out so docs, CLAUDE.md and config count, not just source.

> **Code changes are drafted before they are written.**
>
> - NEVER EDIT FILES DIRECTLY WITHOUT A DRAFT FILE.
> - A change is written into `scratchpad/code-draft-(feature).md` as a numbered list of blocks before any source file is touched.

With:

> **CODE DRAFT FIRST. ALWAYS. Every change is drafted before it is written.**
>
> - NEVER EDIT FILES DIRECTLY WITHOUT A DRAFT FILE. This means ANY file whatsoever: source, docs, CLAUDE.md, config, scripts. Not just code. Running a script that edits files counts too. The only exceptions are `THE-RAW-STACK.md` and the draft files themselves.
> - A change is written into `scratchpad/code-draft-(feature).md` as a numbered list of blocks before any file is touched.

---

No changelog block: nothing in the app changes.

Flag, not a block: the code-draft rule only exists in `aulists/CLAUDE.md`. Sessions in other projects under `claudecode` won't see it. Say if you want a short pointer to it in `claudecode/CLAUDE.md` too.
