import * as fs from 'fs/promises';
import * as path from 'path';
import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { DirNode, CodeSymbol, AnalysisResult } from './types.js';

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];
const IGNORE_PATTERNS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];

export class CodeIntake {
  private project: Project;
  
  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        skipLibCheck: true,
        target: 99, // ESNext
      },
    });
  }

  async analyzeDirectory(rootPath: string, maxFiles: number = 500): Promise<AnalysisResult> {
    const symbols: CodeSymbol[] = [];
    const dependencies: Array<{from: string; to: string; kind: string}> = [];
    const files: string[] = [];
    const errors: Array<{file: string; message: string}> = [];

    try {
      const allFiles = await this.findSourceFiles(rootPath, maxFiles);
      files.push(...allFiles);

      // Add files to ts-morph project
      for (const filePath of allFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          this.project.createSourceFile(filePath, content, { overwrite: true });
        } catch (error) {
          errors.push({ file: filePath, message: `Failed to read file: ${error}` });
        }
      }

      // Analyze each file
      for (const sourceFile of this.project.getSourceFiles()) {
        try {
          const fileSymbols = await this.analyzeFile(sourceFile);
          symbols.push(...fileSymbols);
          
          const fileDeps = this.extractDependencies(sourceFile);
          dependencies.push(...fileDeps);
        } catch (error) {
          errors.push({ 
            file: sourceFile.getFilePath(), 
            message: `Analysis failed: ${error}` 
          });
        }
      }

      return { symbols, dependencies, files, errors };
    } catch (error) {
      errors.push({ file: rootPath, message: `Directory analysis failed: ${error}` });
      return { symbols, dependencies, files, errors };
    }
  }

  async buildDirectoryTree(rootPath: string): Promise<DirNode> {
    const stats = await fs.stat(rootPath);
    const name = path.basename(rootPath);

    if (!stats.isDirectory()) {
      return { name, path: rootPath, kind: 'file' };
    }

    const children: DirNode[] = [];
    
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (this.shouldIgnore(entry.name)) continue;
        
        const childPath = path.join(rootPath, entry.name);
        
        if (entry.isDirectory()) {
          const childTree = await this.buildDirectoryTree(childPath);
          children.push(childTree);
        } else if (this.isSupportedFile(entry.name)) {
          children.push({ name: entry.name, path: childPath, kind: 'file' });
        }
      }
    } catch (error) {
      // If we can't read directory, still return the node
      console.warn(`Failed to read directory ${rootPath}: ${error}`);
    }

    return { name, path: rootPath, kind: 'dir', children };
  }

  private async findSourceFiles(rootPath: string, maxFiles: number): Promise<string[]> {
    const files: string[] = [];
    
    const traverse = async (dirPath: string) => {
      if (files.length >= maxFiles) return;
      
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (files.length >= maxFiles) break;
          if (this.shouldIgnore(entry.name)) continue;
          
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await traverse(fullPath);
          } else if (this.isSupportedFile(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Failed to traverse ${dirPath}: ${error}`);
      }
    };

    await traverse(rootPath);
    return files;
  }

  private async analyzeFile(sourceFile: SourceFile): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];
    const filePath = sourceFile.getFilePath();

    // Extract classes
    sourceFile.getClasses().forEach(cls => {
      const symbol: CodeSymbol = {
        name: cls.getName() || 'Anonymous',
        kind: 'class',
        file: filePath,
        line: cls.getStartLineNumber(),
        column: cls.getStart(),
        properties: cls.getProperties().map(prop => ({
          name: prop.getName(),
          type: prop.getType().getText(),
          line: prop.getStartLineNumber()
        })),
        methods: cls.getMethods().map(method => ({
          name: method.getName(),
          parameters: method.getParameters().map(p => p.getName()),
          returnType: method.getReturnType().getText(),
          line: method.getStartLineNumber()
        })),
        extends: cls.getExtends()?.getText(),
        implements: cls.getImplements().map(impl => impl.getText())
      };
      symbols.push(symbol);
    });

    // Extract interfaces
    sourceFile.getInterfaces().forEach(iface => {
      const symbol: CodeSymbol = {
        name: iface.getName(),
        kind: 'interface',
        file: filePath,
        line: iface.getStartLineNumber(),
        column: iface.getStart(),
        properties: iface.getProperties().map(prop => ({
          name: prop.getName(),
          type: prop.getType().getText(),
          line: prop.getStartLineNumber()
        })),
        extends: iface.getExtends().map(ext => ext.getText()).join(', ') || undefined
      };
      symbols.push(symbol);
    });

    // Extract functions
    sourceFile.getFunctions().forEach(func => {
      const symbol: CodeSymbol = {
        name: func.getName() || 'anonymous',
        kind: 'function',
        file: filePath,
        line: func.getStartLineNumber(),
        column: func.getStart(),
        methods: [{
          name: func.getName() || 'anonymous',
          parameters: func.getParameters().map(p => p.getName()),
          returnType: func.getReturnType().getText(),
          line: func.getStartLineNumber()
        }]
      };
      symbols.push(symbol);
    });

    // Extract type aliases
    sourceFile.getTypeAliases().forEach(type => {
      const symbol: CodeSymbol = {
        name: type.getName(),
        kind: 'type',
        file: filePath,
        line: type.getStartLineNumber(),
        column: type.getStart()
      };
      symbols.push(symbol);
    });

    // Extract enums
    sourceFile.getEnums().forEach(enumDecl => {
      const symbol: CodeSymbol = {
        name: enumDecl.getName(),
        kind: 'enum',
        file: filePath,
        line: enumDecl.getStartLineNumber(),
        column: enumDecl.getStart(),
        properties: enumDecl.getMembers().map(member => ({
          name: member.getName(),
          line: member.getStartLineNumber()
        }))
      };
      symbols.push(symbol);
    });

    return symbols;
  }

  private extractDependencies(sourceFile: SourceFile): Array<{from: string; to: string; kind: string}> {
    const dependencies: Array<{from: string; to: string; kind: string}> = [];
    const filePath = sourceFile.getFilePath();

    // Extract import dependencies
    sourceFile.getImportDeclarations().forEach(importDecl => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (moduleSpecifier.startsWith('.')) {
        // Relative import - resolve to absolute path
        const resolvedPath = path.resolve(path.dirname(filePath), moduleSpecifier);
        dependencies.push({
          from: filePath,
          to: resolvedPath,
          kind: 'import'
        });
      }
    });

    // Extract class inheritance
    sourceFile.getClasses().forEach(cls => {
      const extendsClause = cls.getExtends();
      if (extendsClause) {
        dependencies.push({
          from: filePath,
          to: extendsClause.getText(),
          kind: 'extends'
        });
      }

      cls.getImplements().forEach(impl => {
        dependencies.push({
          from: filePath,
          to: impl.getText(),
          kind: 'implements'
        });
      });
    });

    return dependencies;
  }

  private shouldIgnore(name: string): boolean {
    return IGNORE_PATTERNS.some(pattern => name.includes(pattern)) ||
           name.startsWith('.') ||
           name.startsWith('__');
  }

  private isSupportedFile(filename: string): boolean {
    return SUPPORTED_EXTENSIONS.some(ext => filename.endsWith(ext));
  }
}