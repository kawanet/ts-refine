# Force bash so `set -o pipefail` works in the recipes below.
SHELL := bash
.SHELLFLAGS := -eo pipefail -c

SRC := $(shell find ../src -name '*.ts' -not -name '*.test.ts')
TYPES := $(wildcard ../types/*.d.ts)
BUILDER_SRC := $(wildcard ./*.ts)

MJS_DST := ../dist/ts-refine.mjs
MJS_CONFIG := ./rollup-mjs.config.ts

CLI_DST := ../dist/ts-refine.cli.mjs
CLI_CONFIG := ./rollup-cli.config.ts

# Public runtime named exports the smoke target must find in the bundle.
# Derived from `export declare function <name>(...)` lines in the
# published .d.ts so adding a new entry there is enough — no parallel
# update here.
NAMED_EXPORTS := $(shell sed -nE 's/^export declare function ([a-zA-Z_$$]+).*/\1/p' $(TYPES))

# Bundle should contain only this package's own src/ — ts-morph is
# externalized. A noticeably larger output means an accidental bundling
# of a transitive dep (which would be hundreds of KB); fail the build so it
# cannot slip in. Sized with headroom over the real bundle so ordinary feature
# growth doesn't trip it — only a transitive dep would.
MAX_BYTES := 80000

ALL := $(MJS_DST) $(CLI_DST)

all: $(ALL)

$(MJS_DST): $(MJS_CONFIG) $(SRC) $(BUILDER_SRC)
	@mkdir -p $(dir $@)
	../node_modules/.bin/rollup -c $<
	@ls -l $@
	@test "$$(wc -c < $@)" -le $(MAX_BYTES) || { echo "ERROR: $@ exceeds $(MAX_BYTES) byte cap" >&2; exit 1; }
	@echo ""

$(CLI_DST): $(CLI_CONFIG) $(SRC) $(BUILDER_SRC)
	@mkdir -p $(dir $@)
	../node_modules/.bin/rollup -c $<
	@ls -l $@
	@test "$$(wc -c < $@)" -le $(MAX_BYTES) || { echo "ERROR: $@ exceeds $(MAX_BYTES) byte cap" >&2; exit 1; }
	@echo ""

# Verify the bundle by importing the package itself through the public
# entrypoint. This catches misconfigured `exports`/`main` paths. An
# empty NAMED_EXPORTS would let smoke silently pass even when the .d.ts
# regex stops matching, so guard against it explicitly.
smoke: $(MJS_DST)
	@test -n "$(NAMED_EXPORTS)" || { echo "ERROR: NAMED_EXPORTS empty — check the sed pattern against $(TYPES)" >&2; exit 1; }
	cd .. && node --input-type=module -e 'const m = await import("ts-refine"); for (const k of process.argv.slice(1)) { if (typeof m[k] !== "function") { console.error("missing MJS export:", k); process.exit(1); } console.log("MJS export OK:", k); }' $(NAMED_EXPORTS)

test: all smoke
	cd .. && node dist/ts-refine.cli.mjs format --check
	cd .. && ./node_modules/.bin/tsc --noEmit
	cd .. && node --test 'src/**/*.test.ts'

clean:
	/bin/rm -fr $(ALL)

.PHONY: all clean test smoke
