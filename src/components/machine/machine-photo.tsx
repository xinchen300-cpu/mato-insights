import { DEFAULT_MACHINE_PHOTO, mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * The picture on a machine tile. A machine without its own photo shows the
 * default machine (the MATO C1) so a tile never looks broken or empty. The frame keeps its shape either way, so a row of
 * tiles lines up whether or not the photos are in yet.
 */
export function MachinePhoto({
  path,
  className,
  children,
}: {
  path: string | null;
  className?: string;
  /** Laid over the picture: a status dot, a fill badge. */
  children?: React.ReactNode;
}) {
  const url = mediaUrl(path);
  return (
    <span
      className={cn(
        "relative block aspect-[4/3] w-full overflow-hidden bg-[linear-gradient(160deg,#f6f2ea,#ece6da)]",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={DEFAULT_MACHINE_PHOTO}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-contain px-[18%] pt-[9%] pb-[5%] drop-shadow-[0_10px_14px_rgb(0_0_0/0.18)]"
        />
      )}
      {children}
    </span>
  );
}
