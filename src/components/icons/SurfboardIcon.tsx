import { type SVGProps } from "react";

export function SurfboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Surfboard outline – elongated oval tilted 45° with a center stringer */}
      <ellipse cx="12" cy="12" rx="3.5" ry="10" transform="rotate(-45 12 12)" />
      <line x1="7" y1="17" x2="17" y2="7" />
    </svg>
  );
}
