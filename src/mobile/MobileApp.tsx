import type { RefObject } from 'react'
import { Compass, FileText, Folder, PencilRuler, UserRound } from 'lucide-react'
import { useStore, type MobileTab } from '../store'
import { Toasts } from '../ui/Toasts'
import { CalibrateDialog, DwgDialog, MarkerDialog, RoomShapeDialog, TextDialog } from '../ui/Dialogs'
import { AutoDetectDialog } from '../ui/AutoDetectDialog'
import { MapModal } from '../ui/MapModal'
import { ReportView } from '../ui/ReportView'
import { AppearanceSheet } from '../ui/AppearanceSheet'
import { BroadcastBar } from '../auth/BroadcastBar'
import { PlansScreen } from './PlansScreen'
import { StudioScreen } from './StudioScreen'
import { CompassScreen } from '../compass/CompassScreen'
import { ReportScreen } from './ReportScreen'
import { AccountScreen } from './AccountScreen'
import { haptic } from '../native'
import './mobile.css'

const TABS: { id: MobileTab; label: string; icon: typeof Folder }[] = [
  { id: 'plans', label: 'Plans', icon: Folder },
  { id: 'studio', label: 'Studio', icon: PencilRuler },
  { id: 'compass', label: 'Compass', icon: Compass },
  { id: 'report', label: 'Report', icon: FileText },
  { id: 'account', label: 'Account', icon: UserRound },
]

/** The phone app: five tabs, one task each. Screens stay mounted only while shown, except
 *  the studio's canvas state, which lives in the store and survives tab changes. */
export function MobileApp({ fileRef, cameraRef, onFiles }: {
  fileRef: RefObject<HTMLInputElement | null>
  cameraRef: RefObject<HTMLInputElement | null>
  onFiles: (files: FileList) => void
}) {
  const tab = useStore((s) => s.mobileTab)
  const setTab = useStore((s) => s.setMobileTab)
  const mapOpen = useStore((s) => s.mapOpen)
  const reportOpen = useStore((s) => s.reportOpen)
  const appearanceOpen = useStore((s) => s.appearanceOpen)
  const setAppearanceOpen = useStore((s) => s.setAppearanceOpen)
  const hasPlan = useStore((s) => s.bg.kind !== 'none' || s.pts.length > 0)

  return (
    <div className="m-app" data-tab={tab}>
      <main className="m-screen">
        {tab === 'plans' && <PlansScreen />}
        {tab === 'studio' && <StudioScreen />}
        {tab === 'compass' && <CompassScreen active />}
        {tab === 'report' && <ReportScreen />}
        {tab === 'account' && <AccountScreen />}
      </main>

      <nav className="m-tabs" aria-label="Sections">
        {TABS.map(({ id, label, icon: Icon }) => {
          const dim = (id === 'studio' || id === 'report') && !hasPlan
          return (
            <button key={id} className={`m-tab ${tab === id ? 'on' : ''} ${dim ? 'dim' : ''}`} aria-current={tab === id ? 'page' : undefined}
              onClick={() => { if (tab !== id) haptic('light'); setTab(id) }}>
              <Icon size={22} strokeWidth={tab === id ? 2.2 : 1.8} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <Toasts />
      <CalibrateDialog />
      <MarkerDialog />
      <TextDialog />
      <RoomShapeDialog />
      <DwgDialog />
      <AutoDetectDialog />
      <AppearanceSheet open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
      {mapOpen && <MapModal />}
      {reportOpen && <ReportView />}
      <BroadcastBar />
      <input ref={fileRef} type="file" accept=".pdf,.dxf,.dwg,.vastu,.json,image/*" hidden
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}
