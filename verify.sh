#!/usr/bin/env bash
# Rebuild the app and run every check. Stops at the first failure.
#   ./verify.sh          everything
#   ./verify.sh --quick  build + syntax + engine only (no browser, ~10s)
#
# The checks price real bids, so they need the two private files in src/ —
# see DEVELOPING.md, "The two files that are not in this repository".
set -euo pipefail
cd "$(dirname "$0")"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

if [ ! -f src/company_data.json ] || [ ! -f src/workbook.xlsm ]; then
  echo "The checks need the company rates and the estimate workbook, and this"
  echo "checkout does not have them (they are deliberately not in the repository)."
  echo
  echo "Unzip the Arctic company file and put these two in place, then re-run:"
  echo "    src/company_data.json"
  echo "    src/workbook.xlsm"
  echo
  echo "Building index.html on its own does not need them: python3 build.py"
  exit 1
fi

step "build"                 ; python3 build.py
step "javascript parses"     ; node --check build/app.js
step "engine vs the workbook"; node test/harness2.js
[ "${1:-}" = "--quick" ] && { echo; echo "quick checks passed"; exit 0; }

step "pdf writer / zip / io" ; node test/adv_io.js
step "app end-to-end"        ; node test/e2e.js
step "no rates published"    ; node test/company_file.js
step "undo + progress"       ; node test/undo_progress.js
step "import accept/deny"    ; node test/selective_diff.js
step "keyboard navigation"   ; node test/keynav.js
step "proposal pickers"      ; node test/proposal_pickers.js
step "sm import from a file" ; node test/smimport_file.js
step "how to page"           ; node test/howto.js
step "no clipped text"       ; node test/clip_check.js
step "pdf layout"            ; node test/pdf_check.js
step "spreadsheet round-trip"; node test/roundtrip.js
                               python3 test/diff_xlsm.py src/workbook.xlsm build/roundtrip.xlsm

printf '\n\033[1mAll checks passed.\033[0m Commit index.html together with your src/ change.\n'
