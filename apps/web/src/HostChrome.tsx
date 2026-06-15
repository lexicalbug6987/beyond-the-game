import type { ReactNode } from "react";
import AdminAccessButton from "./AdminAccessButton";

export default function HostChrome({ children }: { children: ReactNode }) {
  const onAdmin = window.location.pathname.endsWith("/admin.html");

  return (
    <>
      {!onAdmin && (
        <div className="admin-toolbar">
          <AdminAccessButton />
        </div>
      )}
      {children}
    </>
  );
}
