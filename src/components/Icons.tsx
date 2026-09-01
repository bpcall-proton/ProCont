interface IconProps {
  size?: number
}

function Svg({
  children,
  size = 20,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  )
}

export function DashboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" />
    </Svg>
  )
}

export function StoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 10 1.6-6h12.8l1.6 6M5 10v10h14V10M9 20v-6h6v6M3 10h18" />
    </Svg>
  )
}

export function ScanIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3H4a1 1 0 0 0-1 1v3m14-4h3a1 1 0 0 1 1 1v3M7 21H4a1 1 0 0 1-1-1v-3m14 4h3a1 1 0 0 0 1-1v-3M5 12h14M8 8h8m-8 8h5" />
    </Svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="m19 13.5 2-1.5-2-1.5-.5-1.3.4-2.5-2.5-.4-1.1-1L14.5 3h-3l-.8 2.3-1.1 1-2.5.4.4 2.5-.5 1.3L5 12l2 1.5.5 1.3-.4 2.5 2.5.4 1.1 1 .8 2.3h3l.8-2.3 1.1-1 2.5-.4-.4-2.5.5-1.3Z" />
    </Svg>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9" />
    </Svg>
  )
}

export function CloudIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 18h11a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.2 8.7 4.7 4.7 0 0 0 7 18Z" />
    </Svg>
  )
}

export function DeviceIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect height="18" rx="2" width="14" x="5" y="3" />
      <path d="M9 18h6" />
    </Svg>
  )
}

export function AccountingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3h14v18H5V3Zm3 4h8M8 11h2m4 0h2M8 15h2m4 0h2" />
    </Svg>
  )
}

export function ReportsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V9m6 11V4m6 16v-7m4 7H2" />
    </Svg>
  )
}

export function PaidInvoicesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3h12v18H6V3Zm3 5h6m-6 4h3m-3 4 2 2 4-5" />
    </Svg>
  )
}

export function ProductIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10" />
    </Svg>
  )
}

export function ProductionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V9l5 3V9l5 3V4h4v16H4Zm3-3h2m3 0h2m3 0h1" />
    </Svg>
  )
}
