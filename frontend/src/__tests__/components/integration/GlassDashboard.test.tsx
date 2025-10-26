import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GlassDashboard } from "@/components/integration/GlassDashboard";

describe("GlassDashboard", () => {
  it("renders with title and description", () => {
    render(<GlassDashboard />);
    
    expect(screen.getByText(/Two-Layer Glass Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Identity \(front\) and Object \(rear\) layers/i)).toBeInTheDocument();
  });

  it("displays simulate buttons", () => {
    render(<GlassDashboard />);
    
    const permitButton = screen.getByRole("button", { name: /Simulate PERMIT/i });
    const denyButton = screen.getByRole("button", { name: /Simulate DENY/i });
    
    expect(permitButton).toBeInTheDocument();
    expect(denyButton).toBeInTheDocument();
    expect(permitButton).not.toBeDisabled();
    expect(denyButton).not.toBeDisabled();
  });

  it("triggers permit animation when PERMIT button clicked", async () => {
    render(<GlassDashboard />);
    
    const permitButton = screen.getByRole("button", { name: /Simulate PERMIT/i });
    fireEvent.click(permitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Layers merging/i)).toBeInTheDocument();
      expect(permitButton).toBeDisabled();
    });
  });

  it("triggers deny animation when DENY button clicked", async () => {
    render(<GlassDashboard />);
    
    const denyButton = screen.getByRole("button", { name: /Simulate DENY/i });
    fireEvent.click(denyButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Layers separating/i)).toBeInTheDocument();
      expect(denyButton).toBeDisabled();
    });
  });

  it("displays front glass (identity) explanation", () => {
    render(<GlassDashboard />);
    
    expect(screen.getByText(/Front Glass \(Identity\)/i)).toBeInTheDocument();
    expect(screen.getByText(/JWT claims and subject attributes/i)).toBeInTheDocument();
  });

  it("displays rear glass (object) explanation", () => {
    render(<GlassDashboard />);
    
    expect(screen.getByText(/Rear Glass \(Object\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ZTDF structure and policy/i)).toBeInTheDocument();
  });

  it("has proper ARIA attributes", () => {
    render(<GlassDashboard />);
    
    const section = screen.getByRole("region", { name: /glass dashboard/i });
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute("aria-labelledby", "glass-dashboard-title");
  });
});

describe("FrontGlass", () => {
  it("can import FrontGlass without errors", async () => {
    const { FrontGlass } = await import("@/components/integration/FrontGlass");
    expect(FrontGlass).toBeDefined();
  });
});

describe("RearGlass", () => {
  it("can import RearGlass without errors", async () => {
    const { RearGlass } = await import("@/components/integration/RearGlass");
    expect(RearGlass).toBeDefined();
  });
});

