import { render, screen, waitFor } from "@testing-library/react";
import { AttributeDiff } from "@/components/integration/AttributeDiff";

describe("AttributeDiff", () => {
  it("renders with title and description", () => {
    render(<AttributeDiff />);
    
    expect(screen.getByText(/Attribute Inspection & Comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/Side-by-side comparison/i)).toBeInTheDocument();
  });

  it("displays subject attributes column", () => {
    render(<AttributeDiff />);
    
    expect(screen.getByText(/Subject Attributes/i)).toBeInTheDocument();
    expect(screen.getByText(/ADatP-5663/i)).toBeInTheDocument();
  });

  it("displays resource attributes column", () => {
    render(<AttributeDiff />);
    
    expect(screen.getByText(/Resource Attributes/i)).toBeInTheDocument();
    expect(screen.getByText(/ACP-240/i)).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    render(<AttributeDiff />);
    
    expect(screen.getByText(/Evaluating policy/i)).toBeInTheDocument();
  });

  it("displays evaluation results after loading", async () => {
    render(<AttributeDiff />);
    
    await waitFor(() => {
      expect(screen.getByText(/Policy Evaluation Results/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("shows check results (clearance, country, COI)", async () => {
    render(<AttributeDiff />);
    
    await waitFor(() => {
      expect(screen.getByText(/Clearance Check/i)).toBeInTheDocument();
      expect(screen.getByText(/Releasability Check/i)).toBeInTheDocument();
      expect(screen.getByText(/COI Intersection/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("displays final decision badge", async () => {
    render(<AttributeDiff />);
    
    await waitFor(() => {
      const decision = screen.getByText(/ALLOW|DENY/);
      expect(decision).toBeInTheDocument();
    }, { timeout: 1000 });
  });
});
