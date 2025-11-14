import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JWTLens } from "@/components/integration/JWTLens";

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
});

describe("JWTLens", () => {
  it("renders with title and description", () => {
    render(<JWTLens />);
    
    expect(screen.getByText(/Federation Visualizer \(JWT Lens\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw JWT structure, parsed claims/i)).toBeInTheDocument();
  });

  it("displays raw JWT panel", () => {
    render(<JWTLens />);
    
    // Week 4 BEST PRACTICE: Multiple "Raw JWT" elements, use getAllByText
    const rawJwtElements = screen.getAllByText(/Raw JWT/i);
    expect(rawJwtElements.length).toBeGreaterThan(0);
  });

  it("displays parsed claims panel", () => {
    render(<JWTLens />);
    
    // Week 4 BEST PRACTICE: Multiple "Parsed Claims" elements, use getAllByText
    const parsedElements = screen.getAllByText(/Parsed Claims/i);
    expect(parsedElements.length).toBeGreaterThan(0);
  });

  it("shows copy button", () => {
    render(<JWTLens />);
    
    const copyButton = screen.getByRole("button", { name: /Copy/i });
    expect(copyButton).toBeInTheDocument();
  });

  it("copies JWT to clipboard when copy button clicked", async () => {
    render(<JWTLens />);
    
    const copyButton = screen.getByRole("button", { name: /Copy/i });
    fireEvent.click(copyButton);
    
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(screen.getByText(/Copied!/i)).toBeInTheDocument();
    });
  });

  it("displays trust chain graph", () => {
    render(<JWTLens />);
    
    // Week 4 BEST PRACTICE: These text elements may appear multiple times
    const trustChainElements = screen.getAllByText(/Trust Chain/i);
    expect(trustChainElements.length).toBeGreaterThan(0);
    
    const issuerElements = screen.getAllByText(/Issuer/i);
    expect(issuerElements.length).toBeGreaterThan(0);
    
    // These are specific enough to use getByText
    expect(screen.getByText(/Signing Cert/i)).toBeInTheDocument();
    expect(screen.getByText(/Root CA/i)).toBeInTheDocument();
    
    const validElements = screen.getAllByText(/Valid/i);
    expect(validElements.length).toBeGreaterThan(0);
  });

  it("displays provenance tags for claims", () => {
    render(<JWTLens />);
    
    // Week 4 BEST PRACTICE: Multiple provenance tags exist, use getAllByText
    const idpElements = screen.getAllByText(/IdP/i);
    expect(idpElements.length).toBeGreaterThan(0);
    
    const aaElements = screen.getAllByText(/Attribute Authority/i);
    expect(aaElements.length).toBeGreaterThan(0);
    
    const derivedElements = screen.getAllByText(/Derived/i);
    expect(derivedElements.length).toBeGreaterThan(0);
  });
});

