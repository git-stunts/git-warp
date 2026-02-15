# hero.tape — git-warp hero GIF for README
# Record: vhs hero.tape

Output docs/images/hero.gif

Set Shell "bash"
Set FontSize 16
Set Width 960
Set Height 520
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set CursorBlink false

# ── Setup: use sandbox, clean prompt, disable pager, fresh checkpoint ──
Hide
Type `cd /Users/james/git/git-stunts/git-warp-sandbox`
Enter
Sleep 300ms
Type `export PS1=$'\e[33m$\e[0m '`
Enter
Sleep 300ms
Type `export GIT_PAGER=cat`
Enter
Sleep 300ms
Type "git warp materialize > /dev/null 2>&1"
Enter
Sleep 2s
Type "clear"
Enter
Sleep 500ms
Show

# ── Scene 1: "look ma, no files" ──
Type "# look ma, no files"
Enter
Sleep 1200ms
Type "git log --oneline"
Enter
Sleep 2500ms

# ── Scene 2: "but there's an entire graph database in here" ──
Type "# but there's an entire graph database in here!"
Enter
Sleep 1200ms
Type "git warp --view info"
Enter
Sleep 4s

# ── Scene 3: query it — who does alice manage? ──
Type "git warp query --match 'user:alice' --outgoing manages --select id"
Enter
Sleep 3s

# ── Scene 4: find a path across the org ──
Type "git warp --view path --from user:alice --to user:charlie --dir out"
Enter
Sleep 3500ms

# ── Scene 5: peek behind the curtain — warp refs ──
Type "# the data lives in refs/warp/"
Enter
Sleep 1200ms
Type "git for-each-ref --format='%(objectname:short) %(refname)'"
Enter
Sleep 3s

# ── Scene 6: the commits that hold it all ──
Type "git log --all --oneline --graph"
Enter
Sleep 4s
