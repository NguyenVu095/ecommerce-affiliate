interface VnpayLogoProps {
  className?: string;
}

export default function VnpayLogo({ className = "" }: VnpayLogoProps) {
  return (
    <svg
      viewBox="0 0 120 40"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="VNPAY"
      className={className}
    >
      <rect width="120" height="40" rx="6" fill="#fff" />
      <path d="M8 8h4v4H8zM14 8h4v4h-4zM20 8h4v4h-4zM8 14h4v4H8zM20 14h4v4h-4zM8 20h4v4H8zM14 20h4v4h-4zM20 20h4v4h-4z" fill="#005baa" />
      <path d="M14 14h4v4h-4zM26 8h4v4h-4zM26 14h4v4h-4zM26 20h4v4h-4zM8 26h4v4H8zM14 26h4v4h-4zM20 26h4v4h-4zM26 26h4v4h-4z" fill="#ed1c24" />
      <text
        x="36"
        y="27"
        fill="#005baa"
        fontFamily="Arial, sans-serif"
        fontSize="22"
        fontStyle="italic"
        fontWeight="800"
        letterSpacing="-1"
      >
        VN
      </text>
      <text
        x="67"
        y="27"
        fill="#ed1c24"
        fontFamily="Arial, sans-serif"
        fontSize="22"
        fontStyle="italic"
        fontWeight="800"
        letterSpacing="-1"
      >
        PAY
      </text>
    </svg>
  );
}
