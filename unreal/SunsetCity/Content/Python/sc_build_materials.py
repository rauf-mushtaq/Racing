"""Sunset City: build the master materials (run once, inside the Unreal Editor).

How: open the project, then in the Output Log's command line type
    py "<project folder>/Content/Python/sc_build_materials.py"
(or Tools > Execute Python Script). It creates, in /Game/SunsetCity/Materials:

    M_SC_Surface   stucco, stone, asphalt, wood, metal, cloth, ...: vertex colour x Tint, with fine and coarse noise in the colour and the roughness
    M_SC_CarPaint  clear-coated paint (the car's colour is in the vertex colours)
    M_SC_Glass     refractive glass
    M_SC_Window    glass whose windows light up at night, floor by floor and room by room (the Night parameter)
    M_SC_Glow      lights: lamps, signs, ceiling panels, signals
    M_SC_Foliage   leaves, grass: two-sided, with light coming through them
    M_SC_Water     single-layer water (the sea, the pools, the fountain)
    M_SC_Skin      skin with subsurface scattering

Every parameter the C++ sets (Tint, Roughness, Metallic, Specular, Emissive, Opacity, Night) is named here exactly as in Source/SunsetCity/SCMaterials.cpp.
Each material is built on its own: if one step is not available in your engine version the script says so and carries on with the rest (a material that is missing just
makes the game use flat vertex colours for those surfaces)."""
import unreal

MAT_DIR = '/Game/SunsetCity/Materials'
lib = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
eal = unreal.EditorAssetLibrary


def say(msg):
    unreal.log('[SunsetCity] ' + msg)


def warn(msg):
    unreal.log_warning('[SunsetCity] ' + msg)


def prop(obj, name, value):
    """set_editor_property that reports instead of raising (names differ a little between engine versions)."""
    try:
        obj.set_editor_property(name, value)
        return True
    except Exception as e:  # noqa: BLE001
        warn('could not set %s on %s: %s' % (name, obj.get_class().get_name(), e))
        return False


def enum(cls_name, *names):
    """First enum value that exists among names (e.g. unreal.MaterialShadingModel.MSM_CLEAR_COAT)."""
    cls = getattr(unreal, cls_name, None)
    if cls is None:
        return None
    for n in names:
        if hasattr(cls, n):
            return getattr(cls, n)
    return None


class Graph:
    """A little helper for building a material graph."""

    def __init__(self, name, **settings):
        path = MAT_DIR + '/' + name
        if eal.does_asset_exist(path):
            eal.delete_asset(path)
        self.mat = tools.create_asset(name, MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
        self.name = name
        self.col = 0
        for k, v in settings.items():
            if v is not None:
                prop(self.mat, k, v)

    def node(self, cls, x, y):
        return lib.create_material_expression(self.mat, getattr(unreal, cls), x, y)

    def scalar(self, pname, default, x=-1500, y=0):
        n = self.node('MaterialExpressionScalarParameter', x, y)
        prop(n, 'parameter_name', pname)
        prop(n, 'default_value', default)
        return n

    def vector(self, pname, rgb, x=-1500, y=0):
        n = self.node('MaterialExpressionVectorParameter', x, y)
        prop(n, 'parameter_name', pname)
        prop(n, 'default_value', unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
        return n

    def const(self, value, x, y):
        n = self.node('MaterialExpressionConstant', x, y)
        prop(n, 'r', value)
        return n

    def link(self, a, b, into, out=''):
        ok = lib.connect_material_expressions(a, out, b, into)
        if not ok:
            warn('%s: could not connect %s -> %s.%s' % (self.name, a.get_class().get_name(), b.get_class().get_name(), into))
        return b

    def op(self, cls, a, b, x, y, a_out='', b_out='', const_a=None, const_b=None, a_in='A', b_in='B'):
        n = self.node(cls, x, y)
        if a is not None:
            lib.connect_material_expressions(a, a_out, n, a_in)
        elif const_a is not None:
            prop(n, 'const_a', const_a)
        if b is not None:
            lib.connect_material_expressions(b, b_out, n, b_in)
        elif const_b is not None:
            prop(n, 'const_b', const_b)
        return n

    def mul(self, a, b, x, y, **kw):
        return self.op('MaterialExpressionMultiply', a, b, x, y, **kw)

    def add(self, a, b, x, y, **kw):
        return self.op('MaterialExpressionAdd', a, b, x, y, **kw)

    def lerp(self, a, b, alpha, x, y, const_a=None, const_b=None):
        n = self.node('MaterialExpressionLinearInterpolate', x, y)
        if a is not None:
            lib.connect_material_expressions(a, '', n, 'A')
        elif const_a is not None:
            prop(n, 'const_a', const_a)
        if b is not None:
            lib.connect_material_expressions(b, '', n, 'B')
        elif const_b is not None:
            prop(n, 'const_b', const_b)
        lib.connect_material_expressions(alpha, '', n, 'Alpha')
        return n

    def noise(self, scale, x, y, levels=3, lo=0.0, hi=1.0):
        """Value noise in world space (so a pattern runs on unbroken from one wall or one road to the next)."""
        n = self.node('MaterialExpressionNoise', x, y)
        wp = self.node('MaterialExpressionWorldPosition', x - 250, y)
        lib.connect_material_expressions(wp, '', n, 'Position')
        prop(n, 'scale', scale)
        prop(n, 'levels', levels)
        prop(n, 'output_min', lo)
        prop(n, 'output_max', hi)
        prop(n, 'turbulence', False)
        return n

    def out(self, node, material_property, out=''):
        ok = lib.connect_material_property(node, out, material_property)
        if not ok:
            warn('%s: could not connect to %s' % (self.name, material_property))

    def finish(self):
        lib.recompile_material(self.mat)
        eal.save_asset(MAT_DIR + '/' + self.name)
        say('built ' + self.name)


MP = unreal.MaterialProperty


def vertex_tint(g, x=-1100, y=-200):
    vc = g.node('MaterialExpressionVertexColor', x, y)
    tint = g.vector('Tint', (1, 1, 1), x, y + 200)
    return g.mul(vc, tint, x + 300, y), vc, tint


def surface():
    g = Graph('M_SC_Surface')
    base, _, _ = vertex_tint(g)
    coarse = g.noise(0.0035, -800, 150)                       # patches a few metres across (dirt, sun-bleaching, damp)
    fine = g.noise(0.06, -800, 350, levels=2)                 # grain a few centimetres across
    shade1 = g.lerp(None, None, coarse, -450, 100, const_a=0.80, const_b=1.08)
    shade2 = g.lerp(None, None, fine, -450, 250, const_a=0.93, const_b=1.05)
    c1 = g.mul(base, shade1, -150, -150, b_out='')
    c2 = g.mul(c1, shade2, 50, -150)
    g.out(c2, MP.MP_BASE_COLOR)
    rough = g.scalar('Roughness', 0.7, -1100, 600)
    lo = g.mul(rough, None, -700, 600, const_b=0.8)
    hi = g.mul(rough, None, -700, 700, const_b=1.15)
    r = g.lerp(lo, hi, fine, -400, 650)
    sat = g.node('MaterialExpressionSaturate', -200, 650)
    g.link(r, sat, 'Input')
    g.out(sat, MP.MP_ROUGHNESS)
    g.out(g.scalar('Metallic', 0.0, -1100, 850), MP.MP_METALLIC)
    g.out(g.scalar('Specular', 0.5, -1100, 950), MP.MP_SPECULAR)
    g.finish()


def car_paint():
    g = Graph('M_SC_CarPaint', shading_model=enum('MaterialShadingModel', 'MSM_CLEAR_COAT'))
    base, _, _ = vertex_tint(g)
    g.out(base, MP.MP_BASE_COLOR)
    g.out(g.scalar('Roughness', 0.3, -1100, 500), MP.MP_ROUGHNESS)
    g.out(g.const(0.55, -900, 700), MP.MP_METALLIC)           # the metallic flake under the lacquer
    g.out(g.const(0.5, -900, 800), MP.MP_SPECULAR)
    g.out(g.const(1.0, -900, 900), MP.MP_CLEAR_COAT)
    g.out(g.const(0.03, -900, 1000), MP.MP_CLEAR_COAT_ROUGHNESS)
    g.finish()


def glass(name, windows):
    g = Graph(name, blend_mode=enum('BlendMode', 'BLEND_TRANSLUCENT'), two_sided=True,
              translucency_lighting_mode=enum('TranslucencyLightingMode', 'TLM_SURFACE_PER_PIXEL_LIGHTING', 'TLM_SURFACE'))
    vc = g.node('MaterialExpressionVertexColor', -1100, -300)
    tint = g.vector('Tint', (0.5, 0.65, 0.8), -1100, -100)
    base = g.mul(vc, tint, -800, -200)
    g.out(base, MP.MP_BASE_COLOR)
    g.out(g.scalar('Roughness', 0.05, -1100, 300), MP.MP_ROUGHNESS)
    g.out(g.scalar('Specular', 0.7, -1100, 400), MP.MP_SPECULAR)
    g.out(g.scalar('Opacity', 0.4, -1100, 500), MP.MP_OPACITY)
    g.out(g.const(1.06, -900, 600), MP.MP_REFRACTION)
    if windows:
        # A window is lit when a hash of its cell (150 cm by 380 cm: the texture coordinates are metres on the wall) says so; a lit one glows warm. Night 0..1.
        uv = g.node('MaterialExpressionTextureCoordinate', -1100, 800)
        night = g.scalar('Night', 0.0, -1100, 950)
        c = g.node('MaterialExpressionCustom', -700, 850)
        prop(c, 'description', 'LitWindows')
        prop(c, 'output_type', enum('CustomMaterialOutputType', 'CMOT_FLOAT3'))
        prop(c, 'code', '''float2 cell = floor(UV / float2(1.5, 3.8));
float h = frac(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
float h2 = frac(sin(dot(cell, float2(39.346, 11.135))) * 24634.6345);
float lit = step(0.64, h) * Night;
float3 warm = lerp(float3(1.0, 0.72, 0.38), float3(1.0, 0.93, 0.8), h2);
return warm * lit * 5.0;''')
        a = unreal.CustomInput(); prop(a, 'input_name', 'UV')
        b = unreal.CustomInput(); prop(b, 'input_name', 'Night')
        prop(c, 'inputs', [a, b])
        lib.connect_material_expressions(uv, '', c, 'UV')
        lib.connect_material_expressions(night, '', c, 'Night')
        g.out(c, MP.MP_EMISSIVE_COLOR)
    g.finish()


def glow():
    g = Graph('M_SC_Glow')
    vc = g.node('MaterialExpressionVertexColor', -1100, -300)
    tint = g.vector('Tint', (1, 1, 1), -1100, -100)
    col = g.mul(vc, tint, -800, -200)
    em = g.scalar('Emissive', 3.5, -1100, 200)
    night = g.scalar('Night', 0.0, -1100, 350)
    boost = g.lerp(None, None, night, -800, 300, const_a=0.5, const_b=1.0)      # lamps glow a little by day, fully at night
    k = g.mul(em, boost, -550, 250)
    e = g.mul(col, k, -300, 0)
    g.out(e, MP.MP_EMISSIVE_COLOR)
    g.out(g.const(0.0, -600, 450), MP.MP_BASE_COLOR)
    g.finish()


def foliage():
    g = Graph('M_SC_Foliage', shading_model=enum('MaterialShadingModel', 'MSM_TWO_SIDED_FOLIAGE'), two_sided=True)
    base, _, _ = vertex_tint(g)
    coarse = g.noise(0.004, -800, 150)
    fine = g.noise(0.05, -800, 350, levels=2)
    s1 = g.lerp(None, None, coarse, -450, 100, const_a=0.72, const_b=1.15)
    s2 = g.lerp(None, None, fine, -450, 250, const_a=0.88, const_b=1.1)
    c = g.mul(g.mul(base, s1, -150, -150), s2, 50, -150)
    g.out(c, MP.MP_BASE_COLOR)
    g.out(c, MP.MP_SUBSURFACE_COLOR)                          # light comes through a leaf in its own colour
    g.out(g.scalar('Roughness', 0.65, -1100, 600), MP.MP_ROUGHNESS)
    g.out(g.scalar('Specular', 0.3, -1100, 700), MP.MP_SPECULAR)
    g.finish()


def skin():
    g = Graph('M_SC_Skin', shading_model=enum('MaterialShadingModel', 'MSM_SUBSURFACE', 'MSM_PREINTEGRATED_SKIN'))
    base, _, _ = vertex_tint(g)
    fine = g.noise(0.12, -800, 350, levels=2)
    s = g.lerp(None, None, fine, -450, 250, const_a=0.95, const_b=1.04)
    c = g.mul(base, s, -150, -150)
    g.out(c, MP.MP_BASE_COLOR)
    red = g.vector('Scatter', (1.0, 0.32, 0.22), -700, 700)
    g.out(g.mul(c, red, -300, 600), MP.MP_SUBSURFACE_COLOR)   # blood under the skin
    g.out(g.scalar('Roughness', 0.5, -1100, 600), MP.MP_ROUGHNESS)
    g.out(g.scalar('Specular', 0.45, -1100, 700), MP.MP_SPECULAR)
    g.out(g.const(0.35, -900, 850), MP.MP_OPACITY)            # how much light scatters
    g.finish()


def water():
    sm = enum('MaterialShadingModel', 'MSM_SINGLE_LAYER_WATER')
    g = Graph('M_SC_Water', shading_model=sm, blend_mode=enum('BlendMode', 'BLEND_OPAQUE'))
    tint = g.vector('Tint', (0.04, 0.32, 0.42), -1100, -100)
    g.out(tint, MP.MP_BASE_COLOR)
    g.out(g.const(0.0, -900, 100), MP.MP_METALLIC)
    g.out(g.const(0.5, -900, 200), MP.MP_SPECULAR)
    g.out(g.scalar('Roughness', 0.05, -1100, 300), MP.MP_ROUGHNESS)
    # Ripples: two layers of noise give the water's normal its small waves (still; the sea's big swell is the sky's reflection moving as you move).
    n1 = g.noise(0.012, -950, 700, levels=3, lo=-1.0, hi=1.0)
    n2 = g.noise(0.05, -950, 900, levels=2, lo=-1.0, hi=1.0)
    height = g.add(n1, n2, -650, 800)
    bump = g.node('MaterialExpressionNormalFromHeightmap', -400, 800)
    try:
        lib.connect_material_expressions(height, '', bump, 'Heightmap')
        g.out(bump, MP.MP_NORMAL)
    except Exception as e:  # noqa: BLE001
        warn('water ripples skipped: %s' % e)
    g.finish()


BUILDERS = [('M_SC_Surface', surface), ('M_SC_CarPaint', car_paint), ('M_SC_Glass', lambda: glass('M_SC_Glass', False)),
            ('M_SC_Window', lambda: glass('M_SC_Window', True)), ('M_SC_Glow', glow), ('M_SC_Foliage', foliage), ('M_SC_Skin', skin), ('M_SC_Water', water)]


def main():
    if not eal.does_directory_exist(MAT_DIR):
        eal.make_directory(MAT_DIR)
    made = []
    for name, fn in BUILDERS:
        try:
            fn()
            made.append(name)
        except Exception as e:  # noqa: BLE001
            warn('%s FAILED: %s' % (name, e))
    say('done: %d of %d materials built (%s).' % (len(made), len(BUILDERS), ', '.join(made)))


main()
