#!/usr/bin/env bash
# Autoresearch benchmark wrapper for NATS performance
set -euo pipefail
cd "$(dirname "$0")"

# Run 3 iterations and take the median for stability
declare -a burst_p50 burst_p95 js_rt_p50 js_pub_p50 storm_per_event storm_debounced

for i in 1 2 3; do
  result=$(bun scripts/perf-nats-baseline.ts --json 2>/dev/null)

  # Extract metrics from JSON results array
  burst_p50+=($(echo "$result" | jq '[.results[] | select(.name | startswith("Burst"))] | .[0].p50'))
  burst_p95+=($(echo "$result" | jq '[.results[] | select(.name | startswith("Burst"))] | .[0].p95'))
  js_rt_p50+=($(echo "$result" | jq '[.results[] | select(.name | contains("round-trip"))] | .[0].p50'))
  js_pub_p50+=($(echo "$result" | jq '[.results[] | select(.name | contains("await ack"))] | .[0].p50'))
  storm_per_event+=($(echo "$result" | jq '[.results[] | select(.name | contains("per-event"))] | .[0].p50'))
  storm_debounced+=($(echo "$result" | jq '[.results[] | select(.name | contains("debounced"))] | .[0].p50'))
done

# Compute median (sort and take middle)
median() {
  echo "$@" | tr ' ' '\n' | sort -n | sed -n '2p'
}

echo "METRIC burst_p50_ms=$(median ${burst_p50[@]})"
echo "METRIC burst_p95_ms=$(median ${burst_p95[@]})"
echo "METRIC js_roundtrip_p50_ms=$(median ${js_rt_p50[@]})"
echo "METRIC js_publish_await_p50_ms=$(median ${js_pub_p50[@]})"
echo "METRIC storm_per_event_p50_ms=$(median ${storm_per_event[@]})"
echo "METRIC storm_debounced_p50_ms=$(median ${storm_debounced[@]})"
