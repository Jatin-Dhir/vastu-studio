import { useSyncExternalStore } from 'react'
import { chartsVersion, onChartsChanged } from '../rules16'

/** Re-renders when the practitioner's charts arrive or refresh, so memoised readings
 *  (which otherwise key only on geometry) never keep a pre-chart verdict on screen. */
export function useChartsVersion(): number {
  return useSyncExternalStore(onChartsChanged, chartsVersion, chartsVersion)
}
