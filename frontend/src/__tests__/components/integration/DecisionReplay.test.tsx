import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DecisionReplay } from "@/components/integration/DecisionReplay";

jest.mock("react-confetti", () => {
  return function MockConfetti() {
    return <div data-testid="confetti">Confetti</div>;
  };
});

describe("DecisionReplay", () => {
  it("renders with title and description", () => {
    render(<DecisionReplay />);
    
    expect(screen.getByText(/Decision Replay/i)).toBeInTheDocument();
    expect(screen.getByText(/Step-by-step visualization/i)).toBeInTheDocument();
  });

  it("displays playback controls", () => {
    render(<DecisionReplay />);
    
    expect(screen.getByRole("button", { name: /Play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pause/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset/i })).toBeInTheDocument();
  });

  it("starts replay when Play button clicked", async () => {
    render(<DecisionReplay />);
    
    const playButton = screen.getByRole("button", { name: /Play/i });
    fireEvent.click(playButton);
    
    await waitFor(() => {
      expect(playButton).toBeDisabled();
    });
  });

  it("displays steps sequentially", async () => {
    render(<DecisionReplay />);
    
    const playButton = screen.getByRole("button", { name: /Play/i });
    fireEvent.click(playButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Step 1/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("resets replay when Reset button clicked", async () => {
    render(<DecisionReplay />);
    
    const playButton = screen.getByRole("button", { name: /Play/i });
    fireEvent.click(playButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Step 1/i)).toBeInTheDocument();
    });
    
    const resetButton = screen.getByRole("button", { name: /Reset/i });
    fireEvent.click(resetButton);
    
    expect(playButton).not.toBeDisabled();
  });
});

