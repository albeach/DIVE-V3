"use client";

import { Handle, Position, NodeProps } from "reactflow";
import { Info } from "lucide-react";

/**
 * Custom Node Components for FlowMap
 * 
 * Three node types:
 * 1. FederationNode: Rounded rectangle (ADatP-5663) - indigo gradient
 * 2. ObjectNode: Hexagon (ACP-240) - amber gradient
 * 3. SharedNode: Circle (Both standards) - teal solid
 */

interface NodeData {
  label: string;
  standard: "5663" | "240" | "Both";
  specRef: string;
  description: string;
}

/**
 * Federation Node (ADatP-5663)
 * Rounded rectangle with indigo→blue gradient
 */
export function FederationNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className="relative group">
      {/* Handles */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className="w-3 h-3 !bg-indigo-500 border-2 border-white"
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-3 h-3 !bg-blue-500 border-2 border-white"
      />

      {/* Node Body */}
      <div 
        className={`
          px-6 py-4 rounded-xl border-2 shadow-lg
          bg-gradient-to-br from-indigo-500 to-blue-500
          text-white font-semibold text-center
          transition-all duration-200
          ${selected 
            ? "border-indigo-300 ring-4 ring-indigo-300/50 scale-110" 
            : "border-indigo-600 hover:scale-105 hover:shadow-xl"
          }
        `}
        style={{ minWidth: "120px" }}
      >
        {data.label}
        
        {/* Info Icon */}
        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md">
            <Info className="w-3 h-3 text-indigo-600" />
          </div>
        </div>
      </div>

      {/* Tooltip on Hover */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        <div className="bg-gray-900 text-white text-xs py-1 px-3 rounded shadow-lg whitespace-nowrap">
          ADatP-5663
        </div>
      </div>
    </div>
  );
}

/**
 * Object Node (ACP-240)
 * Hexagon shape with amber→red gradient
 */
export function ObjectNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className="relative group">
      {/* Handles */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className="w-3 h-3 !bg-amber-500 border-2 border-white"
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-3 h-3 !bg-red-500 border-2 border-white"
      />

      {/* Node Body - Simulated Hexagon using clip-path */}
      <div 
        className={`
          px-6 py-4 border-2 shadow-lg
          bg-gradient-to-br from-amber-500 to-red-500
          text-white font-semibold text-center
          transition-all duration-200
          ${selected 
            ? "border-amber-300 ring-4 ring-amber-300/50 scale-110" 
            : "border-amber-600 hover:scale-105 hover:shadow-xl"
          }
        `}
        style={{ 
          minWidth: "120px",
          clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)"
        }}
      >
        {data.label}
        
        {/* Info Icon */}
        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md">
            <Info className="w-3 h-3 text-amber-600" />
          </div>
        </div>
      </div>

      {/* Tooltip on Hover */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        <div className="bg-gray-900 text-white text-xs py-1 px-3 rounded shadow-lg whitespace-nowrap">
          ACP-240
        </div>
      </div>
    </div>
  );
}

/**
 * Shared Node (Both 5663 and 240)
 * Circle with teal solid color (ABAC kernel)
 */
export function SharedNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className="relative group">
      {/* Handles */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className="w-3 h-3 !bg-teal-500 border-2 border-white"
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-3 h-3 !bg-teal-500 border-2 border-white"
      />
      <Handle 
        type="source" 
        position={Position.Top} 
        className="w-3 h-3 !bg-teal-500 border-2 border-white"
      />
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 !bg-teal-500 border-2 border-white"
      />

      {/* Node Body - Circle */}
      <div 
        className={`
          w-32 h-32 rounded-full border-2 shadow-lg
          bg-teal-500 flex items-center justify-center
          text-white font-semibold text-center
          transition-all duration-200
          ${selected 
            ? "border-teal-300 ring-4 ring-teal-300/50 scale-110 shadow-2xl" 
            : "border-teal-600 hover:scale-105 hover:shadow-xl"
          }
        `}
      >
        <div className="px-2">
          {data.label}
        </div>
        
        {/* Info Icon */}
        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md">
            <Info className="w-3 h-3 text-teal-600" />
          </div>
        </div>
        
        {/* Glow Effect (Shared ABAC) */}
        {selected && (
          <div className="absolute inset-0 rounded-full bg-teal-400/30 animate-pulse" />
        )}
      </div>

      {/* Tooltip on Hover */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        <div className="bg-gray-900 text-white text-xs py-1 px-3 rounded shadow-lg whitespace-nowrap">
          Both 5663 & 240
        </div>
      </div>
    </div>
  );
}
