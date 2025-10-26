import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SplitViewStorytelling } from "@/components/integration/SplitViewStorytelling";

describe("SplitViewStorytelling", () => {
  it("renders with Federation tab selected by default", () => {
    render(<SplitViewStorytelling />);
    
    // Check header
    expect(screen.getByText(/Federation vs Object Security/i)).toBeInTheDocument();
    
    // Check Federation tab is selected
    const federationTab = screen.getByRole("tab", { name: /Federation \(5663\)/i });
    expect(federationTab).toHaveAttribute("aria-selected", "true");
    
    // Check Object tab is not selected
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    expect(objectTab).toHaveAttribute("aria-selected", "false");
  });

  it("displays Federation panel content initially", () => {
    render(<SplitViewStorytelling />);
    
    // Check Federation panel is visible
    expect(screen.getByRole("tabpanel", { name: /federation/i })).toBeInTheDocument();
    expect(screen.getByText(/Federation Model \(ADatP-5663\)/i)).toBeInTheDocument();
    expect(screen.getByText(/User Authentication/i)).toBeInTheDocument();
  });

  it("switches to Object panel when Object tab is clicked", async () => {
    render(<SplitViewStorytelling />);
    
    // Click Object tab
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    fireEvent.click(objectTab);
    
    // Wait for animation
    await waitFor(() => {
      // Check Object tab is now selected
      expect(objectTab).toHaveAttribute("aria-selected", "true");
      
      // Check Object panel is visible
      expect(screen.getByRole("tabpanel", { name: /object/i })).toBeInTheDocument();
      expect(screen.getByText(/Object Model \(ACP-240\)/i)).toBeInTheDocument();
      expect(screen.getByText(/ZTDF Object Creation/i)).toBeInTheDocument();
    });
  });

  it("switches back to Federation panel", async () => {
    render(<SplitViewStorytelling />);
    
    // Click Object tab
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    fireEvent.click(objectTab);
    
    await waitFor(() => {
      expect(screen.getByText(/Object Model \(ACP-240\)/i)).toBeInTheDocument();
    });
    
    // Click Federation tab
    const federationTab = screen.getByRole("tab", { name: /Federation \(5663\)/i });
    fireEvent.click(federationTab);
    
    await waitFor(() => {
      // Check Federation tab is selected again
      expect(federationTab).toHaveAttribute("aria-selected", "true");
      
      // Check Federation panel is visible
      expect(screen.getByText(/Federation Model \(ADatP-5663\)/i)).toBeInTheDocument();
    });
  });

  it("has proper ARIA attributes for accessibility", () => {
    render(<SplitViewStorytelling />);
    
    // Check section has aria-labelledby
    const section = screen.getByRole("region", { name: /federation vs object/i });
    expect(section).toBeInTheDocument();
    
    // Check tablist role
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAttribute("aria-label", "Security model view selector");
    
    // Check tabs have proper aria-controls
    const federationTab = screen.getByRole("tab", { name: /Federation \(5663\)/i });
    expect(federationTab).toHaveAttribute("aria-controls", "federation-panel");
    expect(federationTab).toHaveAttribute("id", "federation-tab");
    
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    expect(objectTab).toHaveAttribute("aria-controls", "object-panel");
    expect(objectTab).toHaveAttribute("id", "object-tab");
  });

  it("displays keyboard navigation hint", () => {
    render(<SplitViewStorytelling />);
    
    // Check keyboard hint text
    expect(screen.getByText(/Tab/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter/i)).toBeInTheDocument();
    expect(screen.getByText(/to navigate/i)).toBeInTheDocument();
    expect(screen.getByText(/to select/i)).toBeInTheDocument();
  });

  it("applies correct gradient classes to selected tabs", () => {
    render(<SplitViewStorytelling />);
    
    // Check Federation tab has indigo gradient
    const federationTab = screen.getByRole("tab", { name: /Federation \(5663\)/i });
    expect(federationTab.className).toMatch(/from-indigo-500.*via-blue-500.*to-cyan-500/);
    
    // Click Object tab
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    fireEvent.click(objectTab);
    
    // Check Object tab has amber gradient
    expect(objectTab.className).toMatch(/from-amber-500.*via-orange-500.*to-red-500/);
  });
});

describe("FederationPanel", () => {
  it("renders all 5 federation steps", () => {
    render(<SplitViewStorytelling />);
    
    // Check all step titles are present
    expect(screen.getByText(/User Authentication/i)).toBeInTheDocument();
    expect(screen.getByText(/Token Issuance/i)).toBeInTheDocument();
    expect(screen.getByText(/PEP Validation/i)).toBeInTheDocument();
    expect(screen.getByText(/PDP Evaluation/i)).toBeInTheDocument();
    expect(screen.getByText(/Access Granted/i)).toBeInTheDocument();
  });

  it("displays spec references for each step", () => {
    render(<SplitViewStorytelling />);
    
    // Check spec references
    expect(screen.getByText(/§3.9 IdP Authentication/i)).toBeInTheDocument();
    expect(screen.getByText(/§5.1.3 Token Issuance and Claims/i)).toBeInTheDocument();
    expect(screen.getByText(/§5.2.2 Token Validation/i)).toBeInTheDocument();
    expect(screen.getByText(/§6.2 ABAC Components \(PDP\)/i)).toBeInTheDocument();
    expect(screen.getByText(/§6.3 Federated Authorization and Accounting/i)).toBeInTheDocument();
  });

  it("displays key characteristics summary", () => {
    render(<SplitViewStorytelling />);
    
    // Check summary box
    expect(screen.getByText(/Key Characteristics/i)).toBeInTheDocument();
    expect(screen.getByText(/Trust Model:.*IdP-to-SP federation/i)).toBeInTheDocument();
    expect(screen.getByText(/Token Lifetime:.*Ephemeral/i)).toBeInTheDocument();
    expect(screen.getByText(/Focus:.*Subject identity assertion/i)).toBeInTheDocument();
  });
});

describe("ObjectPanel", () => {
  it("renders all 4 object steps", async () => {
    render(<SplitViewStorytelling />);
    
    // Click Object tab
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    fireEvent.click(objectTab);
    
    await waitFor(() => {
      // Check all step titles are present
      expect(screen.getByText(/ZTDF Object Creation/i)).toBeInTheDocument();
      expect(screen.getByText(/Policy Binding/i)).toBeInTheDocument();
      expect(screen.getByText(/KAS Mediation/i)).toBeInTheDocument();
      expect(screen.getByText(/Object Access/i)).toBeInTheDocument();
    });
  });

  it("displays spec references for each step", async () => {
    render(<SplitViewStorytelling />);
    
    // Click Object tab
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    fireEvent.click(objectTab);
    
    await waitFor(() => {
      // Check spec references
      expect(screen.getByText(/§5.1 ZTDF Structure/i)).toBeInTheDocument();
      expect(screen.getByText(/§5.4 Cryptographic Binding & Integrity/i)).toBeInTheDocument();
      expect(screen.getByText(/§5.2 Key Access Service \(KAS\)/i)).toBeInTheDocument();
      expect(screen.getByText(/§5.3 Multi-KAS & Community Keys/i)).toBeInTheDocument();
    });
  });

  it("displays key characteristics summary", async () => {
    render(<SplitViewStorytelling />);
    
    // Click Object tab
    const objectTab = screen.getByRole("tab", { name: /Object \(240\)/i });
    fireEvent.click(objectTab);
    
    await waitFor(() => {
      // Check summary box
      expect(screen.getByText(/Key Characteristics/i)).toBeInTheDocument();
      expect(screen.getByText(/Trust Model:.*Object-to-consumer cryptographic trust/i)).toBeInTheDocument();
      expect(screen.getByText(/Data Lifetime:.*Persistent encryption/i)).toBeInTheDocument();
      expect(screen.getByText(/Focus:.*Policy-bound encryption/i)).toBeInTheDocument();
    });
  });
});

