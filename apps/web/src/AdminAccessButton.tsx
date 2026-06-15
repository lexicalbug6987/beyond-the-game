export default function AdminAccessButton({ block = false }: { block?: boolean }) {
  return (
    <a
      href="/admin.html"
      className={block ? "admin-access-link block" : "admin-access-link"}
    >
      Admin
    </a>
  );
}
