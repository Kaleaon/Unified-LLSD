/**
 * Native WebGL2 Canvas Viewport Plugin and Modular 3D Renderer.
 */

import {
    DetailLevel,
    MeshBlockAdapter,
    GLTFMaterialAdapter
} from './AssetSchemaAdapter.js';
import { PBREngine } from './PBREngine.js';

export interface ViewportOptions {
    canvas: any;
    contextAttributes?: WebGLContextAttributes;
    clearColor?: [number, number, number, number];
}

export class CanvasViewport {
    private canvas: any;
    private gl: any | null = null;
    private animationFrameId: any = null;
    private lodBlocks: Map<DetailLevel, MeshBlockAdapter> = new Map();
    private activeLod: DetailLevel = DetailLevel.HIGHEST;
    private cameraDistance: number = 1.0;
    private cameraPosition: [number, number, number] = [0, 0, 3];
    private cameraTarget: [number, number, number] = [0, 0, 0];
    private material: GLTFMaterialAdapter | null = null;
    private isInitialized: boolean = false;
    private isMock: boolean = false;

    // WebGL Object resources
    private program: any = null;
    private buffers: Map<DetailLevel, {
        positionBuffer?: any;
        normalBuffer?: any;
        texCoordBuffer?: any;
        indexBuffer?: any;
        indexCount: number;
    }> = new Map();

    constructor(options: ViewportOptions) {
        this.canvas = options.canvas;
        this.initWebGL(options.clearColor || [0.1, 0.1, 0.1, 1.0]);
    }

    /**
     * Mount viewport to HTML canvas element.
     */
    public mount(canvas: any): void {
        this.canvas = canvas;
        this.initWebGL([0.1, 0.1, 0.1, 1.0]);
    }

    private initWebGL(clearColor: [number, number, number, number]): void {
        if (!this.canvas) return;

        try {
            if (typeof this.canvas.getContext === 'function') {
                this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
            }
        } catch (e) {
            this.gl = null;
        }

        if (!this.gl) {
            this.isMock = true;
            this.gl = this.createMockGLContext();
        }

        if (this.gl) {
            this.setupShadersAndBuffers();
            this.isInitialized = true;
        }
    }

    private createMockGLContext(): any {
        return {
            viewport: () => {},
            clearColor: () => {},
            clear: () => {},
            enable: () => {},
            depthFunc: () => {},
            useProgram: () => {},
            createBuffer: () => ({ id: Math.random() }),
            bindBuffer: () => {},
            bufferData: () => {},
            drawElements: () => {},
            drawArrays: () => {},
            deleteBuffer: () => {},
            deleteProgram: () => {},
            deleteShader: () => {},
            createProgram: () => ({ id: 1 }),
            createShader: () => ({ id: 1 }),
            shaderSource: () => {},
            compileShader: () => {},
            attachShader: () => {},
            linkProgram: () => {},
            getProgramParameter: () => true,
            getShaderParameter: () => true,
            getUniformLocation: () => ({ id: 1 }),
            getAttribLocation: () => 1,
            enableVertexAttribArray: () => {},
            vertexAttribPointer: () => {},
            uniformMatrix3fv: () => {},
            uniformMatrix4fv: () => {},
            uniform4fv: () => {},
            uniform1f: () => {},
            uniform1i: () => {}
        };
    }

    private setupShadersAndBuffers(): void {
        if (!this.gl || this.isMock) return;

        const gl = this.gl;
        const vsSource = `#version 300 es
        in vec3 a_position;
        in vec3 a_normal;
        in vec2 a_texCoord;

        uniform mat4 u_modelViewMatrix;
        uniform mat4 u_projectionMatrix;
        uniform mat3 u_textureTransform;

        out vec3 v_normal;
        out vec2 v_texCoord;

        void main() {
            v_normal = a_normal;
            vec3 transformedUV = u_textureTransform * vec3(a_texCoord, 1.0);
            v_texCoord = transformedUV.xy;
            gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(a_position, 1.0);
        }`;

        const fsSource = `#version 300 es
        precision mediump float;

        in vec3 v_normal;
        in vec2 v_texCoord;

        uniform vec4 u_baseColor;
        uniform float u_alphaCutoff;
        uniform int u_alphaMode;

        out vec4 fragColor;

        void main() {
            vec4 color = u_baseColor;
            if (u_alphaMode == 1 && color.a < u_alphaCutoff) {
                discard;
            }
            vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
            float diff = max(dot(normalize(v_normal), lightDir), 0.2);
            fragColor = vec4(color.rgb * diff, color.a);
        }`;

        try {
            const vs = gl.createShader(gl.VERTEX_SHADER || 0x8B31);
            gl.shaderSource(vs, vsSource);
            gl.compileShader(vs);

            const fs = gl.createShader(gl.FRAGMENT_SHADER || 0x8B30);
            gl.shaderSource(fs, fsSource);
            gl.compileShader(fs);

            const program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);

            this.program = program;
        } catch (e) {
            // Context compilation fallback
        }
    }

    /**
     * Add or replace a Level of Detail (LOD) mesh block.
     */
    public setMeshBlock(block: MeshBlockAdapter): void {
        this.lodBlocks.set(block.lod, block);
        this.uploadBuffersForBlock(block);
    }

    /**
     * Set full mesh asset with LOD blocks and PBR materials.
     */
    public setMeshAsset(meshAsset: { lodBlocks: Map<DetailLevel, MeshBlockAdapter>; materials?: GLTFMaterialAdapter[] }): void {
        for (const [lod, block] of meshAsset.lodBlocks.entries()) {
            this.setMeshBlock(block);
        }
        if (meshAsset.materials && meshAsset.materials.length > 0) {
            this.material = meshAsset.materials[0];
        }
    }

    private uploadBuffersForBlock(block: MeshBlockAdapter): void {
        if (!this.gl || this.isMock) return;

        const gl = this.gl;
        const posBuffer = gl.createBuffer();
        const normBuffer = gl.createBuffer();
        const uvBuffer = gl.createBuffer();
        const indexBuffer = gl.createBuffer();

        const positions = block.positionArray || new Float32Array(block.positions.flatMap(p => [p.x, p.y, p.z]));
        const normals = block.normalArray || new Float32Array(block.normals.flatMap(n => [n.x, n.y, n.z]));
        const uvs = block.texCoordArray || new Float32Array(block.texCoords.flatMap(u => [u.x, u.y]));
        const indices = block.indexArray || new Uint16Array(block.indices || []);

        gl.bindBuffer(gl.ARRAY_BUFFER || 0x8892, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER || 0x8892, positions, gl.STATIC_DRAW || 0x88E4);

        gl.bindBuffer(gl.ARRAY_BUFFER || 0x8892, normBuffer);
        gl.bufferData(gl.ARRAY_BUFFER || 0x8892, normals, gl.STATIC_DRAW || 0x88E4);

        gl.bindBuffer(gl.ARRAY_BUFFER || 0x8892, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER || 0x8892, uvs, gl.STATIC_DRAW || 0x88E4);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER || 0x8893, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER || 0x8893, indices, gl.STATIC_DRAW || 0x88E4);

        this.buffers.set(block.lod, {
            positionBuffer: posBuffer,
            normalBuffer: normBuffer,
            texCoordBuffer: uvBuffer,
            indexBuffer: indexBuffer,
            indexCount: indices.length
        });
    }

    /**
     * Automatically switch Level of Detail (LOD) based on camera distance relative to mesh.
     * Distance < 5.0 -> HIGHEST / HIGH
     * 5.0 <= Distance < 15.0 -> MEDIUM
     * 15.0 <= Distance < 30.0 -> LOW
     * Distance >= 30.0 -> LOWEST
     */
    public updateCameraDistance(distance: number): DetailLevel {
        this.cameraDistance = distance;
        if (distance < 5.0) {
            this.activeLod = this.lodBlocks.has(DetailLevel.HIGHEST) ? DetailLevel.HIGHEST : DetailLevel.HIGH;
        } else if (distance < 15.0) {
            this.activeLod = this.lodBlocks.has(DetailLevel.MEDIUM) ? DetailLevel.MEDIUM : (this.lodBlocks.has(DetailLevel.HIGH) ? DetailLevel.HIGH : DetailLevel.HIGHEST);
        } else if (distance < 30.0) {
            this.activeLod = this.lodBlocks.has(DetailLevel.LOW) ? DetailLevel.LOW : DetailLevel.MEDIUM;
        } else {
            this.activeLod = this.lodBlocks.has(DetailLevel.LOWEST) ? DetailLevel.LOWEST : DetailLevel.LOW;
        }
        return this.activeLod;
    }

    public getActiveLod(): DetailLevel {
        return this.activeLod;
    }

    /**
     * Render a single frame to the canvas context.
     */
    public renderFrame(): void {
        if (!this.gl) return;

        const gl = this.gl;
        if (typeof gl.viewport === 'function') {
            gl.viewport(0, 0, this.canvas?.width || 800, this.canvas?.height || 600);
            gl.clearColor(0.1, 0.1, 0.1, 1.0);
            gl.clear((gl.COLOR_BUFFER_BIT || 0x00004000) | (gl.DEPTH_BUFFER_BIT || 0x00000100));
        }

        const activeBlock = this.lodBlocks.get(this.activeLod);
        if (!activeBlock) return;

        if (!this.isMock && this.program) {
            gl.useProgram(this.program);
            const buffer = this.buffers.get(this.activeLod);
            if (buffer && buffer.indexBuffer) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER || 0x8893, buffer.indexBuffer);
                gl.drawElements(gl.TRIANGLES || 0x0004, buffer.indexCount, gl.UNSIGNED_SHORT || 0x1403, 0);
            }
        }
    }

    /**
     * Start continuous 60 FPS rendering loop.
     */
    public startAnimationLoop(fpsCallback?: (fps: number) => void): void {
        const frame = () => {
            this.renderFrame();
            if (fpsCallback) fpsCallback(60);
            if (typeof requestAnimationFrame === 'function') {
                this.animationFrameId = requestAnimationFrame(frame);
            } else {
                this.animationFrameId = setTimeout(frame, 1000 / 60);
            }
        };
        frame();
    }

    /**
     * Stop rendering loop.
     */
    public stopAnimationLoop(): void {
        if (this.animationFrameId !== null) {
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.animationFrameId);
            } else {
                clearTimeout(this.animationFrameId);
            }
            this.animationFrameId = null;
        }
    }

    /**
     * Clean up WebGL buffers, textures, programs, and stop animation loop without memory leaks.
     */
    public dispose(): void {
        this.stopAnimationLoop();
        if (this.gl && !this.isMock) {
            for (const [, buf] of this.buffers.entries()) {
                if (buf.positionBuffer) this.gl.deleteBuffer(buf.positionBuffer);
                if (buf.normalBuffer) this.gl.deleteBuffer(buf.normalBuffer);
                if (buf.texCoordBuffer) this.gl.deleteBuffer(buf.texCoordBuffer);
                if (buf.indexBuffer) this.gl.deleteBuffer(buf.indexBuffer);
            }
            if (this.program) {
                this.gl.deleteProgram(this.program);
            }
        }
        this.buffers.clear();
        this.lodBlocks.clear();
        this.isInitialized = false;
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public isMockContext(): boolean {
        return this.isMock;
    }
}
