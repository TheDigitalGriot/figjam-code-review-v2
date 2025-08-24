import { z } from "zod";
import * as path from 'path';
import * as fs from 'fs/promises';
import { CodeIntake } from './code-intake.js';
import { ErdUmlBuilder } from './erd-uml-builder.js';
import { UmlPayload } from './types.js';

// Schema for generate_uml tool
export const generateUmlSchema = z.object({
  rootPath: z.string().describe("Root directory path to analyze"),
  maxFiles: z.number().optional().default(500).describe("Maximum number of files to analyze"),
  includePatterns: z.array(z.string()).optional().describe("Glob patterns to include"),
  excludePatterns: z.array(z.string()).optional().describe("Glob patterns to exclude")
});

// Schema for get_directory_tree tool  
export const getDirectoryTreeSchema = z.object({
  rootPath: z.string().describe("Root directory path"),
  maxDepth: z.number().optional().default(10).describe("Maximum directory depth")
});

// Schema for get_file_contents tool
export const getFileContentsSchema = z.object({
  filePath: z.string().describe("Path to the file to read"),
  startLine: z.number().optional().describe("Start line number (1-based)"),
  endLine: z.number().optional().describe("End line number (1-based)")
});

// Schema for search_symbols tool
export const searchSymbolsSchema = z.object({
  symbolName: z.string().describe("Symbol name to search for"),
  symbolKind: z.enum(['class', 'interface', 'function', 'type', 'enum', 'variable']).optional().describe("Type of symbol to search for")
});

export class UmlTools {
  private codeIntake: CodeIntake;
  private umlBuilder: ErdUmlBuilder;
  private lastGeneratedPayload: UmlPayload | null = null;

  constructor() {
    this.codeIntake = new CodeIntake();
    this.umlBuilder = new ErdUmlBuilder();
  }

  async generateUml(params: z.infer<typeof generateUmlSchema>): Promise<string> {
    try {
      const { rootPath, maxFiles, includePatterns, excludePatterns } = params;
      
      // Validate root path
      const stats = await fs.stat(rootPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path ${rootPath} is not a directory`);
      }

      console.log(`Analyzing directory: ${rootPath}`);
      
      // Analyze the codebase
      const analysisResult = await this.codeIntake.analyzeDirectory(rootPath, maxFiles);
      
      if (analysisResult.errors.length > 0) {
        console.warn(`Analysis completed with ${analysisResult.errors.length} errors`);
      }

      // Build directory tree
      const directory = await this.codeIntake.buildDirectoryTree(rootPath);

      // Generate UML diagram
      const payload = this.umlBuilder.buildUmlDiagram(analysisResult, directory, rootPath);
      this.lastGeneratedPayload = payload;

      const summary = {
        success: true,
        metadata: payload.metadata,
        stats: {
          totalNodes: payload.diagram.nodes.length,
          totalEdges: payload.diagram.edges.length,
          filesAnalyzed: analysisResult.files.length,
          symbolsFound: analysisResult.symbols.length,
          errorsEncountered: analysisResult.errors.length
        },
        errors: analysisResult.errors.length > 0 ? analysisResult.errors.slice(0, 10) : undefined
      };

      return JSON.stringify(summary, null, 2);
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
      return JSON.stringify(errorResult, null, 2);
    }
  }

  async getDirectoryTree(params: z.infer<typeof getDirectoryTreeSchema>): Promise<string> {
    try {
      const { rootPath, maxDepth } = params;
      
      const directory = await this.codeIntake.buildDirectoryTree(rootPath);
      
      // Optionally limit depth
      const limitedDirectory = this.limitTreeDepth(directory, maxDepth);
      
      return JSON.stringify(limitedDirectory, null, 2);
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
      return JSON.stringify(errorResult, null, 2);
    }
  }

  async getFileContents(params: z.infer<typeof getFileContentsSchema>): Promise<string> {
    try {
      const { filePath, startLine, endLine } = params;
      
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      let result: string;
      if (startLine !== undefined || endLine !== undefined) {
        const start = Math.max(0, (startLine || 1) - 1);
        const end = Math.min(lines.length, endLine || lines.length);
        result = lines.slice(start, end).join('\n');
      } else {
        result = content;
      }

      return JSON.stringify({
        success: true,
        filePath,
        content: result,
        totalLines: lines.length,
        requestedRange: startLine || endLine ? { startLine, endLine } : undefined
      }, null, 2);
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        filePath: params.filePath
      };
      return JSON.stringify(errorResult, null, 2);
    }
  }

  async searchSymbols(params: z.infer<typeof searchSymbolsSchema>): Promise<string> {
    try {
      if (!this.lastGeneratedPayload) {
        throw new Error('No UML diagram has been generated yet. Please run generate_uml first.');
      }

      const { symbolName, symbolKind } = params;
      
      const matchingNodes = this.lastGeneratedPayload.diagram.nodes.filter(node => {
        const nameMatch = node.label.toLowerCase().includes(symbolName.toLowerCase()) ||
                         node.symbol?.toLowerCase().includes(symbolName.toLowerCase());
        const kindMatch = !symbolKind || node.kind === symbolKind;
        return nameMatch && kindMatch;
      });

      const results = matchingNodes.map(node => ({
        id: node.id,
        name: node.label,
        kind: node.kind,
        file: node.file,
        line: node.line,
        symbol: node.symbol
      }));

      return JSON.stringify({
        success: true,
        query: { symbolName, symbolKind },
        results,
        totalFound: results.length
      }, null, 2);
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        query: params
      };
      return JSON.stringify(errorResult, null, 2);
    }
  }

  getLastGeneratedPayload(): UmlPayload | null {
    return this.lastGeneratedPayload;
  }

  private limitTreeDepth(tree: any, maxDepth: number, currentDepth: number = 0): any {
    if (currentDepth >= maxDepth || !tree.children) {
      return { ...tree, children: undefined };
    }

    return {
      ...tree,
      children: tree.children?.map((child: any) => 
        this.limitTreeDepth(child, maxDepth, currentDepth + 1)
      )
    };
  }
}