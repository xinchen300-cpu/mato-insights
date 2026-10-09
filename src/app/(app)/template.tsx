/** Every page in the app arrives with the same short fade, so moving around feels like one app. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
