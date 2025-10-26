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
    
    expect(screen.getByText(/Raw JWT/i)).toBeInTheDocument();
  });

  it("displays parsed claims panel", () => {
    render(<JWTLens />);
    
    expect(screen.getByText(/Parsed Claims/i)).toBeInTheDocument();
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
    
    expect(screen.getByText(/Trust Chain/i)).toBeInTheDocument();
    expect(screen.getByText(/Issuer/i)).toBeInTheDocument();
    expect(screen.getByText(/Signing Cert/i)).toBeInTheDocument();
    expect(screen.getByText(/Root CA/i)).toBeInTheDocument();
    expect(screen.getByText(/Valid/i)).toBeInTheDocument();
  });

  it("displays provenance tags for claims", () => {
    render(<JWTLens />);
    
    expect(screen.getByText(/IdP/i)).toBeInTheDocument();
    expect(screen.getByText(/Attribute Authority/i)).toBeInTheDocument();
    expect(screen.getByText(/Derived/i)).toBeInTheDocument();
  });
});

