/* medea.js - Open Source, High-Performance 3D Engine based on WebGL.
 *
 * (c) 2011-2013, Alexander C. Gessler
 *  https://github.com/acgessler/medea.js
 *
 * Made available under the terms and conditions of a 3-clause BSD license.
 *
 */

medealib.define('lodmesh',['mesh'],function(medealib, undefined) {
	"use strict";
	var medea = this, gl = medea.gl;


	// Special render job that selects the most suitable LOD before
	// dispatching the draw command to the renderer.
	//
	// This ensures that, if a mesh is drawn multiple times in a scene,
	// the correct LOD is selected for each instance.
	//
	// See |medea.LODMesh._SelectLOD|, |medea.LODMesh._ComputeLODLevel|
	medea.LODMeshRenderJob = medea.MeshRenderJob.extend({
		
		Draw : function(renderer, statepool) {
			// This implicitly assumes that MeshRenderJob's distance
			// estimate is indeed the squared distance.
			this.mesh._SelectLOD(this.DistanceEstimate());
			renderer.DrawMesh(this, statepool);
		},
	});

	// Mesh with a simple LOD implementation that changes the index
	// buffer (but not the vertex buffer) depending on a function
	// of the distance to the camera.
	//
	// To tweak the LOD selection logic, yu have two options:
	//   1) Override |_SelectLOD| for full control. As control returns,
	//      |this.ibo| should be the actual IBO to use for rendering.
	//   2) Override |_ComputeLODLevel| to tweak the selection of the
	//      LOD index, but not change the way how this maps to IBOs.
	medea.LODMesh = medea.Mesh.extend({

		lod_attenuation_scale : 1,
		ibo_levels : null,
		ibo_creation_flags : 0,
		lod_offset : 0,

		init : function(vbo, ibo_levels, material, rq, pt, line_ibo, ibo_creation_flags) {
			// Submit a null IBO to the base class, we will update
			// |this.ibo| before drawing.
			this._super(vbo, null, material, rq, pt, line_ibo);

			this.ibo_creation_flags = ibo_creation_flags | 0;
			this.ibo_levels = ibo_levels;
		},

		Render : function(viewport, node, rqmanager) {
			// Construct a renderable capable of drawing this mesh with the correct LOD
			rqmanager.Push(this.rq_idx, new medea.LODMeshRenderJob(this, node, viewport));
		},

		LODAttenuationScale :  medealib.Property('lod_attenuation_scale'),
		LODOffset :  medealib.Property('lod_offset'),

		_Clone : function(material_or_color) {
			var mesh = medea.CreateLODMesh(this.vbo, this.ibo_levels,
				material_or_color || this.Material(),
				this.rq,
				this.pt,
				this.line_ibo, 
				this.ibo_creation_flags);

			// Copy BB: this is necessary if this.BB has been
			// manually specified as opposed to the BB being
			// derived from the VBO's extents.
			mesh.BB(this.BB());
			mesh.LODAttenuationScale(this.LODAttenuationScale());
			mesh.LODOffset(this.LODOffset());
			return mesh;
		},

		_ComputeLODLevel : function(sq_distance) {
			// Multiply by two to undo the square in log space
			var log_distance = Math.log(sq_distance * 0.0001) * 2 * this.lod_attenuation_scale;
			return Math.max(0, Math.min(this.ibo_levels.length - 1,
				~~log_distance + this.lod_offset));
		},

		_SelectLOD : function(sq_distance) {
			var lod = this._ComputeLODLevel(sq_distance);

			// Eval the LOD level as needed
			var indices = this.ibo_levels[lod];

			if (typeof indices == "function") {
				indices = this.ibo_levels[lod] = indices();
			}
			if (Array.isArray(indices) && typeof indices === 'object' && !(indices instanceof medealib.Class)) {
				indices = this.ibo_levels[lod] = medea.CreateIndexBuffer(indices, this.ibo_creation_flags);
			}
			
			this.ibo = indices;
			return 0;
		}
	});

	// Variant of |medea.CreateSimpleMesh| for creating LOD meshes.
	//
	// |ibo_levels| is an array of the index buffer sources for all
	// supported LOD levels. Each entry can be one of:
	//
	//  1) Array of indices
	//  2) medea.IndexBuffer
	//  3) function() -> |medea.IndexBuffer|
	//
	//  Unlike CreateSimpleMesh(), 1) and 3) are not evaluated immediately but
	//  the first time the respective LOD level is requested.
	//
	// Supports both index- and vertexbuffer specific |flags|.
	//
	// Mesh will not be cached unless |cache_name| is given.
	medea.CreateLODMesh = function(vertices, ibo_levels, material_or_color, flags, cache_name, rq, pt, line_ibo) {
		if (typeof vertices === 'object' && !(vertices instanceof medealib.Class)) {
			vertices = medea.CreateVertexBuffer(vertices,flags);
		}

		if (Array.isArray(material_or_color)) {
			material_or_color = medea.CreateSimpleMaterialFromColor(material_or_color);
		}

		var mesh = new medea.LODMesh(vertices, ibo_levels, material_or_color, rq, pt, line_ibo);
		if (cache_name !== undefined) {
			medea._mesh_cache[cache_name] = mesh;
		}
		return mesh;
	};
});