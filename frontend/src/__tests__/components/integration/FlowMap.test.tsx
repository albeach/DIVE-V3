import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FlowMap } from "@/components/integration/FlowMap";

// Mock ReactFlow to avoid canvas rendering issues in tests
jest.mock("reactflow", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
  Controls: () => <div data-testid="flow-controls">Controls</div>,
  Background: () => <div data-testid="flow-background">Background</div>,
  BackgroundVariant: { Dots: "dots" },
  useNodesState: (initialNodes: any) => [initialNodes, () => {}, () => {}],
  useEdgesState: (initialEdges: any) => [initialEdges, () => {}, () => {}],
  ConnectionMode: { Loose: "loose" },
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}-${position}`} />
  ),
}));

describe("FlowMap", () => {
  it("renders the flow map with title and description", () => {
    render(<FlowMap />);
    
    expect(screen.getByText(/Zero-Trust Journey Flow Map/i)).toBeInTheDocument();
    expect(screen.getByText(/Interactive visualization of the complete authorization flow/i)).toBeInTheDocument();
  });

  it("displays the legend with all node types", () => {
    render(<FlowMap />);
    
    expect(screen.getByText(/Federation \(5663\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Object \(240\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Shared \(Both\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Token Flow/i)).toBeInTheDocument();
    expect(screen.getByText(/Crypto Flow/i)).toBeInTheDocument();
  });

  it("renders the ReactFlow container", () => {
    render(<FlowMap />);
    
    const flowContainer = screen.getByTestId("react-flow");
    expect(flowContainer).toBeInTheDocument();
  });

  it("displays interaction instructions", () => {
    render(<FlowMap />);
    
    // Week 4 BEST PRACTICE: Multiple "Click" elements exist, use getAllByText
    const clickInstructions = screen.getAllByText(/Click/i);
    expect(clickInstructions.length).toBeGreaterThan(0);
    
    expect(screen.getByText(/Drag/i)).toBeInTheDocument();
    expect(screen.getByText(/Scroll/i)).toBeInTheDocument();
    
    const doubleClickInstructions = screen.getAllByText(/Double-click/i);
    expect(doubleClickInstructions.length).toBeGreaterThan(0);
  });

  it("shows federation flow description", () => {
    render(<FlowMap />);
    
    expect(screen.getByText(/Federation Flow \(5663\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1. User/i)).toBeInTheDocument();
    expect(screen.getByText(/2. IdP/i)).toBeInTheDocument();
    expect(screen.getByText(/3. PEP/i)).toBeInTheDocument();
    expect(screen.getByText(/4. PDP/i)).toBeInTheDocument();
  });

  it("shows object flow description", () => {
    render(<FlowMap />);
    
    expect(screen.getByText(/Object Flow \(240\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1. MongoDB/i)).toBeInTheDocument();
    expect(screen.getByText(/2. PDP/i)).toBeInTheDocument();
    expect(screen.getByText(/3. KAS/i)).toBeInTheDocument();
    expect(screen.getByText(/4. ZTDF/i)).toBeInTheDocument();
  });

  it("has proper ARIA attributes for accessibility", () => {
    render(<FlowMap />);
    
    const section = screen.getByRole("region", { name: /zero-trust/i });
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute("aria-labelledby", "flow-map-title");
  });
});

describe("SpecReferenceModal", () => {
  // Note: Modal tests would require more complex setup with node click simulation
  // These tests verify that the modal component can be imported and used
  
  it("can import SpecReferenceModal without errors", async () => {
    const { SpecReferenceModal } = await import("@/components/integration/SpecReferenceModal");
    expect(SpecReferenceModal).toBeDefined();
  });
});

describe("FlowNode Components", () => {
  it("can import all node types without errors", async () => {
    const { FederationNode, ObjectNode, SharedNode } = await import("@/components/integration/FlowNode");
    expect(FederationNode).toBeDefined();
    expect(ObjectNode).toBeDefined();
    expect(SharedNode).toBeDefined();
  });
});

