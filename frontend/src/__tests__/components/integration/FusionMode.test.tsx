import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FusionMode } from "@/components/integration/FusionMode";

describe("FusionMode", () => {
  it("renders with title and description", () => {
    render(<FusionMode />);
    
    expect(screen.getByText(/Fusion Mode: Unified ABAC View/i)).toBeInTheDocument();
    expect(screen.getByText(/See how identity.*and object.*attributes merge/i)).toBeInTheDocument();
  });

  it("displays user and object cards", () => {
    render(<FusionMode />);
    
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/Subject \(ADatP-5663\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Classified Document/i)).toBeInTheDocument();
    expect(screen.getByText(/Resource \(ACP-240\)/i)).toBeInTheDocument();
  });

  it("shows protocol branches toggle button", () => {
    render(<FusionMode />);
    
    const toggleButton = screen.getByRole("button", { name: /Show Protocol Details/i });
    expect(toggleButton).toBeInTheDocument();
  });

  it("toggles protocol branches visibility", () => {
    render(<FusionMode />);
    
    const toggleButton = screen.getByRole("button", { name: /Show Protocol Details/i });
    fireEvent.click(toggleButton);
    
    expect(screen.getByRole("button", { name: /Hide Protocol Details/i })).toBeInTheDocument();
  });

  it("displays merge button initially", () => {
    render(<FusionMode />);
    
    const mergeButton = screen.getByRole("button", { name: /Simulate ABAC Evaluation/i });
    expect(mergeButton).toBeInTheDocument();
  });

  it("triggers merge animation when button clicked", async () => {
    render(<FusionMode />);
    
    const mergeButton = screen.getByRole("button", { name: /Simulate ABAC Evaluation/i });
    fireEvent.click(mergeButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Merged Attributes/i)).toBeInTheDocument();
    });
  });

  it("displays enforcement flow after merge", async () => {
    render(<FusionMode />);
    
    const mergeButton = screen.getByRole("button", { name: /Simulate ABAC Evaluation/i });
    fireEvent.click(mergeButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Enforcement Flow/i)).toBeInTheDocument();
      expect(screen.getByText(/PEP/i)).toBeInTheDocument();
    });
  });
});
