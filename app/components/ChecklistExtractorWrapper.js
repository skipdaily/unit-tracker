"use client";

import dynamic from 'next/dynamic';

// Dynamically import the component with no server-side rendering
const ChecklistExtractorClient = dynamic(
  () => import('./ChecklistExtractor'),
  { ssr: false } // This ensures the component only renders on the client side
);

// This wrapper ensures the component only runs on the client
export default function ChecklistExtractorWrapper(props) {
  return <ChecklistExtractorClient {...props} />;
}
