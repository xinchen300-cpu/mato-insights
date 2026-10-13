import type { SVGProps } from "react";

/**
 * A vending machine, drawn like the lucide icons around it (24 grid, round
 * 2px stroke): a cabinet standing on the floor, shelves behind the glass,
 * two buttons beside them and the flap below. Where a machine would
 * otherwise get the first letter of its name.
 */
export function MachineIcon({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6 2h12a2 2 0 0 1 2 2v18H4V4a2 2 0 0 1 2-2Z" />
      <path d="M15 2v15" />
      <path d="M4 7.5h11M4 12.5h11" />
      <path d="M4 17h16" />
      <path d="M17.5 6h.01M17.5 9h.01" />
      <path d="M8 19.5h4" />
    </svg>
  );
}
