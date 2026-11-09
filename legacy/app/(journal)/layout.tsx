import Journal from "../journal";

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  // Keep journal data and edits mounted when query-string history changes the page.
  return <><Journal />{children}</>;
}
