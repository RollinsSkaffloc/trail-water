BIN := ./node_modules/.bin
SRC := $(shell find src -name '*.js')
DIST := dist/bundle.js

.PHONY: help install dev build test lint clean

install: node_modules ## Install dependencies when package-lock.json updates
node_modules: package-lock.json
	npm ci
	@touch node_modules

build:
	docker build -t trail-water-app

## TODO: add a testing framework and a makefile command to run repo tests
