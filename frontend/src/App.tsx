import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DeclarationsList from "./pages/DeclarationsList";
import DeclarationEditor from "./pages/DeclarationEditor";
import NotFound from "./pages/NotFound";
import StallionWorkbench from "./pages/StallionWorkbench";
import BrokerReview4 from "./pages/BrokerReview4";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DeclarationsList />} />
          <Route path="/declaration/:id" element={<DeclarationEditor />} />
          <Route path="/stallion/workbench" element={<StallionWorkbench />} />
          <Route path="/stallion/brokerreview4" element={<BrokerReview4 />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
