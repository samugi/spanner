run:
	npm run dev -- --host

reset:
	cp compiler-spec-default.json compiler-spec.json && \
	cp graph-bootstrap-default.json graph-bootstrap.json

test:
	npm test

install:
	npm install