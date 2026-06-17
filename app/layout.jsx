import "./globals.css";

export const metadata = {
  title: "Repositorio Documental · Grupo Ingenio",
  description: "Sistema de gestión documental por procesos de Grupo Ingenio",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
