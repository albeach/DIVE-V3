import { render, screen, fireEvent } from "@testing-library/react";
import { ZTDFViewer } from "@/components/integration/ZTDFViewer";

describe("ZTDFViewer", () => {
  it("renders with title and description", () => {
    render(<ZTDFViewer />);
    
    expect(screen.getByText(/ZTDF Object Viewer/i)).toBeInTheDocument();
    expect(screen.getByText(/Inspect Zero Trust Data Format/i)).toBeInTheDocument();
  });

  it("displays classification badge with flag", () => {
    render(<ZTDFViewer />);
    
    expect(screen.getByText(/GEHEIM \/ SECRET/i)).toBeInTheDocument();
    expect(screen.getByText(/DEU Classification/i)).toBeInTheDocument();
  });

  it("shows crypto status pills", () => {
    render(<ZTDFViewer />);
    
    expect(screen.getByText(/Hash Verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Signature Valid/i)).toBeInTheDocument();
    expect(screen.getByText(/Encrypted/i)).toBeInTheDocument();
  });

  it("displays policy metadata accordion", () => {
    render(<ZTDFViewer />);
    
    expect(screen.getByText(/Policy Metadata/i)).toBeInTheDocument();
    expect(screen.getByText(/Encryption Info/i)).toBeInTheDocument();
    expect(screen.getByText(/Integrity Binding/i)).toBeInTheDocument();
  });

  it("expands and collapses accordion sections", () => {
    render(<ZTDFViewer />);
    
    const policyButton = screen.getByRole("button", { name: /Policy Metadata/i });
    
    // Should be expanded by default
    expect(policyButton).toHaveAttribute("aria-expanded", "true");
    
    // Click to collapse
    fireEvent.click(policyButton);
    expect(policyButton).toHaveAttribute("aria-expanded", "false");
    
    // Click to expand
    fireEvent.click(policyButton);
    expect(policyButton).toHaveAttribute("aria-expanded", "true");
  });

  it("shows KAO list when encryption section expanded", () => {
    render(<ZTDFViewer />);
    
    const encryptionButton = screen.getByRole("button", { name: /Encryption Info/i });
    fireEvent.click(encryptionButton);
    
    expect(screen.getByText(/Key Access Objects \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/KAO 1/i)).toBeInTheDocument();
    expect(screen.getByText(/KAO 2/i)).toBeInTheDocument();
    expect(screen.getByText(/KAO 3/i)).toBeInTheDocument();
  });
});

