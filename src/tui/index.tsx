#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { loadEnv } from "../shared/config";
import { App } from "./App";

export function runTUI() {
  // Load env BEFORE rendering the app
  loadEnv();
  render(<App />);
}
