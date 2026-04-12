// _layout.tsx (or _app.tsx if using Next.js for your web app)
import Head from "next/head"; // If using Next.js
import React from "react";

interface LayoutProps {
  children: React.ReactNode;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; // Store your API key securely

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <>
      <Head>
        <title>Flood Monitoring App</title>
        <meta name="description" content="Monitoring flood stations" />
        <link rel="icon" href="/favicon.ico" />
        {/* Google Maps API Script */}
        {API_KEY && (
          <script
            async
            defer
            src={`https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=initMap&libraries=geometry`}
          ></script>
        )}
      </Head>
      <main>{children}</main>
      {/* Define initMap globally if not handled by a component */}
      {/* In a React/Next.js context, it's usually better to let the component handle map initialization */}
    </>
  );
};

export default Layout;
